from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional
from datetime import datetime, date as Date, timedelta
from database import get_db
from routers.auth import get_current_user
from services.evidence import store_tracker_chunks

router = APIRouter(prefix="/api/tracker", tags=["tracker"])


# ── Schema ────────────────────────────────────────────────────────────────────

class TrackerLog(BaseModel):
    date: Date = Field(default_factory=Date.today)
    mood: Literal["great", "good", "okay", "low", "bad"]
    symptoms: List[str] = Field(default_factory=list, max_length=20)
    sleep_hours: float = Field(ge=0, le=24)
    water_glasses: int = Field(ge=0, le=30)
    stress: int = Field(ge=0, le=10)
    energy: int = Field(ge=0, le=10)
    pain: int = Field(ge=0, le=10)
    notes: str = Field("", max_length=2000)
    diet: Optional[Literal["excellent", "good", "average", "poor"]] = None
    activity: Optional[Literal["none", "light", "moderate", "intense"]] = None
    medication: Optional[Literal["all_taken", "missed", "none", "na"]] = None

    @field_validator("symptoms")
    @classmethod
    def check_symptom_lengths(cls, value: List[str]) -> List[str]:
        for s in value:
            if len(s) > 40:
                raise ValueError("each symptom must be at most 40 characters")
        return value


# ── Streak logic ─────────────────────────────────────────────────────────────

def compute_streak(dates: List[Date], today: Date) -> int:
    """Consecutive days with a log, ending today or yesterday. `dates` need not be sorted/unique."""
    unique_dates = set(dates)
    if not unique_dates:
        return 0

    if today in unique_dates:
        cursor = today
    elif (today - timedelta(days=1)) in unique_dates:
        cursor = today - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor in unique_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("")
async def save_tracker(
    log: TrackerLog,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    today = log.date.isoformat()

    doc = {
        "user_email": current_user["email"],
        "date": today,
        "mood": log.mood,
        "symptoms": log.symptoms,
        "sleep_hours": log.sleep_hours,
        "water_glasses": log.water_glasses,
        "stress": log.stress,
        "energy": log.energy,
        "pain": log.pain,
        "notes": log.notes,
        "diet": log.diet,
        "activity": log.activity,
        "medication": log.medication,
        "updated_at": datetime.utcnow().isoformat(),
    }

    # Upsert — one log per user per day
    await db.tracker_logs.update_one(
        {"user_email": current_user["email"], "date": today},
        {"$set": doc},
        upsert=True,
    )

    saved = await db.tracker_logs.find_one(
        {"user_email": current_user["email"], "date": today}
    )
    saved["_id"] = str(saved["_id"])

    background_tasks.add_task(store_tracker_chunks, db, current_user["_id"], doc)
    return saved


@router.get("/history")
async def get_history(days: int = Query(30, ge=1, le=90), current_user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.tracker_logs.find(
        {"user_email": current_user["email"]},
        sort=[("date", -1)],
    ).limit(days)

    logs = []
    log_dates: List[Date] = []
    async for log in cursor:
        log["_id"] = str(log["_id"])
        logs.append(log)
        try:
            log_dates.append(Date.fromisoformat(log["date"]))
        except (KeyError, ValueError, TypeError):
            pass

    streak = compute_streak(log_dates, Date.today())
    return {"logs": logs, "streak": streak}
