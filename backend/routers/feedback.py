from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from database import get_db
from routers.auth import get_current_user

router = APIRouter(prefix="/api/doctor-feedback", tags=["feedback"])


class DoctorFeedback(BaseModel):
    doctor_name: str = Field(min_length=1, max_length=200)
    system: str = Field(min_length=1, max_length=100)
    rating: int = Field(ge=1, le=10)
    helpfulness: int = Field(ge=1, le=10)
    communication: int = Field(ge=1, le=10)
    follow_up: int = Field(ge=1, le=10)
    satisfaction: int = Field(ge=1, le=10)
    review: str = Field("", max_length=2000)
    department: Optional[str] = Field(None, max_length=200)
    consultation_date: Optional[str] = None


@router.post("")
async def submit_feedback(data: DoctorFeedback, current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = data.model_dump()
    doc["user_email"] = current_user["email"]
    doc["created_at"] = datetime.utcnow().isoformat()
    result = await db.doctor_feedback.insert_one(doc)
    return {"id": str(result.inserted_id)}


@router.get("")
async def list_feedback(current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.doctor_feedback.find(
        {"user_email": current_user["email"]},
        sort=[("created_at", -1)],
    ).limit(50)

    feedback = []
    async for f in cursor:
        f["_id"] = str(f["_id"])
        feedback.append(f)
    return feedback
