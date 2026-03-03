"""
WebSocket hub + Redis pub/sub relay.
Clients subscribe to job updates via WebSocket.
Redis pub/sub messages (from Celery workers) are forwarded to connected clients.
No authentication — single anonymous user.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies import ANONYMOUS_USER_ID
from app.services.ws_manager import manager
from app.config import get_settings

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


@router.websocket("/connect")
async def ws_connect(websocket: WebSocket):
    """
    WebSocket endpoint. No auth required — subscribes to anonymous user's channel.
    """
    user_id_str = str(ANONYMOUS_USER_ID)
    await manager.connect(websocket, user_id_str)

    # Start Redis subscriber for this user
    redis_task = asyncio.create_task(_redis_subscriber(user_id_str))

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id_str)
        redis_task.cancel()


async def _redis_subscriber(user_id: str):
    """Subscribe to Redis channel and forward messages to WebSocket clients."""
    import redis.asyncio as aioredis

    channel = f"user:{user_id}:jobs"
    r = await aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await manager.send_to_user(user_id, data)
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await r.aclose()
