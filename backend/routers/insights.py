from fastapi import APIRouter, Depends, Request

from database import get_db
from limiter import limiter
from routers.auth import get_current_user
from services import le_rag

router = APIRouter(prefix="/api/health-insights", tags=["insights"])


@router.get("")
@limiter.limit("10/minute;60/day")
async def get_insights(request: Request, current_user: dict = Depends(get_current_user)):
    return await le_rag.cached(get_db(), current_user["_id"])


@router.post("/refresh")
@limiter.limit("10/minute;60/day")
async def refresh_insights(request: Request, current_user: dict = Depends(get_current_user)):
    db = get_db()
    run = await le_rag.refresh(db, current_user["_id"])
    result = await le_rag.cached(db, current_user["_id"])
    # refresh's gated_out also carries "awaiting_embeddings" themes.
    return {**result, **run}
