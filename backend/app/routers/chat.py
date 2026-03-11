import asyncio
import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update as sql_update

from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.models.chat import ChatSession, ChatMessage
from app.models.video_job import VideoJob
from app.schemas.chat import ChatMessageIn, ChatMessageOut, ChatSessionOut, ChatSessionCreate
from app.dependencies import get_anonymous_user
from app.services.chat_agent import stream_chat, build_messages_from_history, generate_title

router = APIRouter()


@router.post("/sessions", response_model=ChatSessionOut)
async def create_session(
    body: ChatSessionCreate,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    session = ChatSession(user_id=current_user.id, title=body.title)
    db.add(session)
    await db.flush()
    await db.commit()
    return session


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def get_messages(
    session_id: uuid.UUID,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return msgs.scalars().all()


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: uuid.UUID,
    body: ChatMessageIn,
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send a chat message and stream the AI response via SSE.
    """
    # Verify session ownership
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=body.content,
    )
    db.add(user_msg)
    await db.flush()

    # Load history
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in history_result.scalars().all()
    ]

    # Detect first message (only user_msg just added, no prior assistant message)
    is_first_message = len(history) == 1

    await db.commit()

    return StreamingResponse(
        _stream_and_save(
            history=history,
            session_id=session_id,
            user=current_user,
            db=db,
            api_key=body.api_key,
            model=body.model,
            video_model=body.video_model,
            tts_model=body.tts_model,
            first_user_message=body.content if is_first_message else None,
        ),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


async def _stream_and_save(
    history: list[dict],
    session_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    api_key: str | None = None,
    model: str | None = None,
    video_model: str | None = None,
    tts_model: str | None = None,
    first_user_message: str | None = None,
) -> AsyncGenerator[str, None]:
    queue = asyncio.Queue()

    async def chat_producer():
        try:
            async for token, spec in stream_chat(
                build_messages_from_history(history),
                api_key=api_key,
                model=model,
            ):
                await queue.put({"type": "chat_chunk", "token": token, "spec": spec})
            await queue.put({"type": "chat_done"})
        except asyncio.CancelledError:
            pass
        except Exception as e:
            await queue.put({"type": "chat_error", "error": str(e)})

    async def title_producer():
        try:
            title = await generate_title(first_user_message, api_key, model)
            await queue.put({"type": "title_result", "title": title})
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        finally:
            await queue.put({"type": "title_done"})

    active_tasks = 0
    
    # Start tasks
    chat_task = asyncio.create_task(chat_producer())
    active_tasks += 1
    
    title_task = None
    if first_user_message:
        title_task = asyncio.create_task(title_producer())
        active_tasks += 1

    full_text = ""
    job_id = None
    chat_failed = False

    try:
        while active_tasks > 0:
            msg = await queue.get()
            
            if msg["type"] == "chat_chunk":
                token = msg.get("token")
                spec = msg.get("spec")
                
                if token:
                    full_text += token
                    yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"
                    
                if spec:
                    try:
                        base_settings = spec.get("settings") or {}
                        if video_model:
                            base_settings["video_model"] = video_model

                        base_audio = spec.get("audio_settings") or {}
                        if tts_model:
                            base_audio["tts_model"] = tts_model

                        job = VideoJob(
                            user_id=user.id,
                            session_id=session_id,
                            status="queued",
                            model_provider=spec.get("model_provider", "veo"),
                            prompt=spec["prompt"],
                            settings=base_settings or None,
                            audio_settings=base_audio or None,
                        )
                        db.add(job)
                        await db.flush()
                        job_id = str(job.id)
                        await db.commit()

                        from app.workers.video_gen import generate_video
                        generate_video.delay(job_id)

                        yield f"data: {json.dumps({'type': 'job_created', 'job_id': job_id})}\n\n"

                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                        
            elif msg["type"] == "chat_done":
                active_tasks -= 1
                
            elif msg["type"] == "chat_error":
                yield f"data: {json.dumps({'type': 'error', 'message': msg['error']})}\n\n"
                chat_failed = True
                active_tasks -= 1
                
            elif msg["type"] == "title_result":
                title = msg["title"]
                try:
                    await db.execute(
                        sql_update(ChatSession)
                        .where(ChatSession.id == session_id)
                        .values(title=title)
                    )
                    await db.commit()
                    yield f"data: {json.dumps({'type': 'title_updated', 'title': title})}\n\n"
                except Exception:
                    pass
                    
            elif msg["type"] == "title_done":
                active_tasks -= 1

        if chat_failed:
            return

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except asyncio.CancelledError:
        # Client disconnected (or generator cancelled)
        chat_task.cancel()
        if title_task:
            title_task.cancel()
        raise
    finally:
        # Guarantee DB save even if cancelled or errored
        if full_text:
            # Launch background task to avoid issues with cancelled scope
            async def _save_msg_bg():
                async with AsyncSessionLocal() as session:
                    assistant_msg = ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=full_text,
                        metadata_={"job_id": job_id} if job_id else None,
                    )
                    session.add(assistant_msg)
                    try:
                        await session.commit()
                    except Exception:
                        pass
            
            asyncio.create_task(_save_msg_bg())
