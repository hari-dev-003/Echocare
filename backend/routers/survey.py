import json
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional
from datetime import datetime
from database import get_db
from routers.auth import get_current_user
from services.evidence import store_survey_chunks

router = APIRouter(prefix="/api/survey", tags=["survey"])

MAX_SURVEY_BYTES = 50 * 1024


class SurveyPayload(BaseModel):
    survey_data: Dict[str, Any]


@router.get("")
async def get_survey(current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.surveys.find_one({"user_email": current_user["email"]})
    if not doc:
        return {"survey_data": None, "updated_at": None}
    return {"survey_data": doc.get("survey_data"), "updated_at": doc.get("updated_at")}


@router.post("")
async def save_survey(
    payload: SurveyPayload,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    size = len(json.dumps(payload.survey_data).encode("utf-8"))
    if size > MAX_SURVEY_BYTES:
        raise HTTPException(status_code=413, detail="Survey payload too large (max 50 KB).")

    db = get_db()
    updated_at = datetime.utcnow().isoformat()
    await db.surveys.update_one(
        {"user_email": current_user["email"]},
        {"$set": {"survey_data": payload.survey_data, "updated_at": updated_at}},
        upsert=True,
    )

    background_tasks.add_task(store_survey_chunks, db, current_user["_id"], payload.survey_data)
    return {"survey_data": payload.survey_data, "updated_at": updated_at}
