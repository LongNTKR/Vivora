import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.dependencies import ANONYMOUS_USER_ID, ANONYMOUS_USER_EMAIL
from app.models.user import User
from app.routers import chat, videos, jobs, ws

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure anonymous user exists on startup
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == ANONYMOUS_USER_ID))
        if not result.scalar_one_or_none():
            db.add(User(id=ANONYMOUS_USER_ID, email=ANONYMOUS_USER_EMAIL))
            await db.commit()
            logger.info("Anonymous user created")
        else:
            logger.info("Anonymous user already exists")
    logger.info("Starting Vivora API...")
    yield
    logger.info("Shutting down Vivora API...")


app = FastAPI(
    title="Vivora API",
    description="AI-powered video generation via chat interface",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow all origins for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(ws.router, prefix="/api/ws", tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
