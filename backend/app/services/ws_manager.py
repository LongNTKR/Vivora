"""
WebSocket connection manager.
Tracks active connections per user_id and broadcasts job status updates.
"""
import json
import uuid
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id (str) -> list of WebSocket connections
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        self._connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        conns = self._connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def send_to_user(self, user_id: str, data: dict) -> None:
        message = json.dumps(data)
        dead = []
        for ws in self._connections.get(user_id, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, user_id)

    async def broadcast_job_update(self, user_id: str, job_id: str, status: str, extra: dict | None = None) -> None:
        payload = {"type": "job_update", "job_id": job_id, "status": status}
        if extra:
            payload.update(extra)
        await self.send_to_user(user_id, payload)


# Global singleton
manager = ConnectionManager()
