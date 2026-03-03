"""
Shared FastAPI dependencies.
"""
import uuid

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User

# Fixed UUID for the single anonymous user
ANONYMOUS_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
ANONYMOUS_USER_EMAIL = "anonymous@vivora.local"


async def get_anonymous_user(db: AsyncSession = Depends(get_db)) -> User:
    """Return the anonymous user. Raises 500 if not yet initialized."""
    result = await db.execute(select(User).where(User.id == ANONYMOUS_USER_ID))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=500, detail="Anonymous user not initialized. Run migrations first.")
    return user
