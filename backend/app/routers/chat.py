import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.chat import ChatSession, ChatMessage
from app.models.video_job import VideoJob
from app.schemas.chat import ChatMessageIn, ChatSessionOut, ChatSessionCreate
from app.dependencies import get_anonymous_user
from app.services.chat_agent import stream_chat, build_messages_from_history

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
    current_user: User = Depends(get_anonymous_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


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

    await db.commit()

    return StreamingResponse(
        _stream_and_save(
            history=history,
            session_id=session_id,
            user=current_user,
            db=db,
        ),
        media_type="text/event-stream",
    )


async def _stream_and_save(
    history: list[dict],
    session_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    full_text = ""
    job_id = None

    async for token, spec in stream_chat(build_messages_from_history(history)):
        if token:
            full_text += token
            yield f"data: {json.dumps({'type': 'token', 'text': token})}\n\n"

        if spec:
            # Generation triggered — enqueue job
            try:
                async with db as inner_db:
                    job = VideoJob(
                        user_id=user.id,
                        session_id=session_id,
                        status="queued",
                        model_provider=spec.get("model_provider", "veo"),
                        prompt=spec["prompt"],
                        settings=spec.get("settings"),
                        audio_settings=spec.get("audio_settings"),
                    )
                    inner_db.add(job)
                    await inner_db.flush()
                    job_id = str(job.id)
                    await inner_db.commit()

                # Enqueue Celery task
                from app.workers.video_gen import generate_video
                generate_video.delay(job_id)

                yield f"data: {json.dumps({'type': 'job_created', 'job_id': job_id})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    # Save assistant message
    async with db as save_db:
        assistant_msg = ChatMessage(
            session_id=session_id,
            role="assistant",
            content=full_text,
            metadata_={"job_id": job_id} if job_id else None,
        )
        save_db.add(assistant_msg)
        await save_db.commit()

    yield f"data: {json.dumps({'type': 'done'})}\n\n"
