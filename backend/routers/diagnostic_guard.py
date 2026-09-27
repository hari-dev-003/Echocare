from datetime import datetime, timedelta
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel, Field

from database import get_db
from limiter import limiter
from routers.auth import get_current_user
from services import le_rag
from services.diagnostic_guard import candidate_pairs, find_gaps, tracker_averages
from services.evidence import delete_chunks_by_source, store_opinion_chunks
from services.llm import generate
from services.safety import non_diagnostic_guard

router = APIRouter(prefix="/api/diagnostic-guard", tags=["diagnostic-guard"])

_DEFAULTS = {"doctor_opinions": [], "requested_markers": [], "escalated": False, "escalated_at": None, "contradictions": []}

CLASSIFY_SYSTEM = (
    "You compare two clinicians' opinions about the same patient and decide whether they "
    "conflict. You never diagnose and never invent facts that are not present in the opinions "
    "given. Respond with a single JSON object and nothing else:\n"
    '{"contradicts": true|false, "stance_a": "one sentence", "stance_b": "one sentence", '
    '"summary": "1-2 neutral sentences describing the disagreement (or agreement)"}'
)
CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "contradicts": {"type": "boolean"},
        "stance_a": {"type": "string"},
        "stance_b": {"type": "string"},
        "summary": {"type": "string"},
    },
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class OpinionCreate(BaseModel):
    doctor: str = Field(min_length=1, max_length=200)
    specialty: str = Field(min_length=1, max_length=200)
    opinion_text: str = Field(min_length=1, max_length=5000)
    date: Optional[str] = None


class MarkersUpdate(BaseModel):
    markers: List[str] = Field(default_factory=list, max_length=50)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _public(doc: dict | None) -> dict:
    doc = doc or {}
    return {k: doc.get(k, v) for k, v in _DEFAULTS.items()}


async def _opinion_features(db, patient_id: ObjectId, opinion_id: str) -> dict:
    chunks = await db.evidence_chunks.find(
        {"patient_id": patient_id, "source_type": "report", "source_ref": f"opinion:{opinion_id}"},
        {"theme_tags": 1, "embedding": 1},
    ).to_list(length=None)
    themes: set = set()
    embedding = None
    for c in chunks:
        themes.update(c.get("theme_tags") or [])
        if embedding is None and c.get("embedding"):
            embedding = c["embedding"]
    return {"id": opinion_id, "themes": themes, "embedding": embedding}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def get_state(current_user: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.diagnostic_guard.find_one({"patient_id": current_user["_id"]})
    return _public(doc)


@router.post("/opinions")
async def add_opinion(
    data: OpinionCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)
):
    db = get_db()
    opinion = {
        "id": str(ObjectId()),
        "doctor": data.doctor.strip(),
        "specialty": data.specialty.strip(),
        "date": data.date or datetime.utcnow().strftime("%Y-%m-%d"),
        "opinion_text": data.opinion_text.strip(),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.diagnostic_guard.update_one(
        {"patient_id": current_user["_id"]},
        {
            "$push": {"doctor_opinions": opinion},
            "$setOnInsert": {"requested_markers": [], "escalated": False, "escalated_at": None, "contradictions": []},
        },
        upsert=True,
    )
    background_tasks.add_task(
        store_opinion_chunks, db, current_user["_id"], opinion["id"], opinion["doctor"], opinion["specialty"], opinion["opinion_text"],
    )
    return opinion


@router.delete("/opinions/{opinion_id}")
async def delete_opinion(opinion_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db.diagnostic_guard.update_one(
        {"patient_id": current_user["_id"]},
        {
            "$pull": {
                "doctor_opinions": {"id": opinion_id},
                "contradictions": {"$or": [{"a_id": opinion_id}, {"b_id": opinion_id}]},
            }
        },
    )
    await delete_chunks_by_source(db, current_user["_id"], "report", f"opinion:{opinion_id}")
    return {"success": True}


@router.put("/markers")
async def update_markers(data: MarkersUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    markers = sorted({m.strip() for m in data.markers if m.strip()})
    await db.diagnostic_guard.update_one(
        {"patient_id": current_user["_id"]},
        {
            "$set": {"requested_markers": markers},
            "$setOnInsert": {"doctor_opinions": [], "escalated": False, "escalated_at": None, "contradictions": []},
        },
        upsert=True,
    )
    return {"requested_markers": markers}


@router.post("/escalate")
async def escalate(current_user: dict = Depends(get_current_user)):
    db = get_db()
    now = datetime.utcnow().isoformat()
    await db.diagnostic_guard.update_one(
        {"patient_id": current_user["_id"]},
        {
            "$set": {"escalated": True, "escalated_at": now},
            "$setOnInsert": {"doctor_opinions": [], "requested_markers": [], "contradictions": []},
        },
        upsert=True,
    )
    return {"escalated": True, "escalated_at": now}


@router.delete("/escalate")
async def unescalate(current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db.diagnostic_guard.update_one(
        {"patient_id": current_user["_id"]},
        {
            "$set": {"escalated": False, "escalated_at": None},
            "$setOnInsert": {"doctor_opinions": [], "requested_markers": [], "contradictions": []},
        },
        upsert=True,
    )
    return {"escalated": False, "escalated_at": None}


@router.get("/gaps")
async def get_gaps(current_user: dict = Depends(get_current_user)):
    db = get_db()
    chunks = await db.evidence_chunks.find(
        {"patient_id": current_user["_id"]}, {"theme_tags": 1, "timestamp": 1, "source_type": 1},
    ).to_list(length=None)
    return {"gaps": find_gaps(chunks, datetime.utcnow())}


@router.post("/contradictions/check")
@limiter.limit("10/minute;50/day")
async def check_contradictions(request: Request, current_user: dict = Depends(get_current_user)):
    db = get_db()
    patient_id = current_user["_id"]
    doc = await db.diagnostic_guard.find_one({"patient_id": patient_id}) or {}
    opinions = doc.get("doctor_opinions", [])
    cached = doc.get("contradictions", [])
    if len(opinions) < 2:
        return {"contradictions": cached}

    by_id = {o["id"]: o for o in opinions}
    features = [await _opinion_features(db, patient_id, o["id"]) for o in opinions]
    pairs = candidate_pairs(features)

    cached_keys = {(c["a_id"], c["b_id"]) for c in cached}
    new_pairs = [p for p in pairs if p not in cached_keys]

    new_results = []
    for a_id, b_id in new_pairs:
        a, b = by_id.get(a_id), by_id.get(b_id)
        if not a or not b:
            continue
        prompt = (
            f"Opinion A -- {a['doctor']} ({a['specialty']}): {a['opinion_text']}\n\n"
            f"Opinion B -- {b['doctor']} ({b['specialty']}): {b['opinion_text']}"
        )
        result = await generate(
            "classify", CLASSIFY_SYSTEM, [{"role": "user", "content": prompt}], json_schema=CLASSIFY_SCHEMA,
        )
        parsed = result["parsed"] or {}
        summary = str(parsed.get("summary") or "").strip()
        stance_a = str(parsed.get("stance_a") or "")
        stance_b = str(parsed.get("stance_b") or "")
        if not summary or non_diagnostic_guard(summary) or non_diagnostic_guard(stance_a) or non_diagnostic_guard(stance_b):
            continue  # drop rather than cache/show diagnostic-sounding or empty text
        new_results.append({
            "a_id": a_id,
            "b_id": b_id,
            "contradicts": bool(parsed.get("contradicts")),
            "summary": summary,
            "checked_at": datetime.utcnow().isoformat(),
        })

    if new_results:
        await db.diagnostic_guard.update_one(
            {"patient_id": patient_id}, {"$push": {"contradictions": {"$each": new_results}}},
        )

    return {"contradictions": cached + new_results}


@router.get("/brief")
async def get_brief(current_user: dict = Depends(get_current_user)):
    db = get_db()
    patient_id = current_user["_id"]

    doc = await db.diagnostic_guard.find_one({"patient_id": patient_id})
    if not doc:
        await db.diagnostic_guard.update_one(
            {"patient_id": patient_id}, {"$setOnInsert": dict(_DEFAULTS)}, upsert=True,
        )
        doc = await db.diagnostic_guard.find_one({"patient_id": patient_id})

    case_ref = str(doc["_id"])[-12:].upper()

    chunks = await db.evidence_chunks.find(
        {"patient_id": patient_id}, {"theme_tags": 1, "timestamp": 1, "source_type": 1},
    ).to_list(length=None)
    gaps = find_gaps(chunks, datetime.utcnow())

    insights_result = await le_rag.cached(db, patient_id)
    top_insights = [
        {
            "theme": i["theme"], "title": i["title"], "observation": i["observation"],
            "confidence": i["confidence"], "low_confidence": i["low_confidence"],
        }
        for i in insights_result["insights"][:3]
    ]

    cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
    logs = await db.tracker_logs.find(
        {"user_email": current_user["email"], "date": {"$gte": cutoff}},
        {"energy": 1, "pain": 1, "stress": 1, "sleep_hours": 1, "water_glasses": 1},
    ).to_list(length=None)

    return {
        "case_ref": case_ref,
        "generated_at": datetime.utcnow().isoformat(),
        "escalated": doc.get("escalated", False),
        "gaps": gaps,
        "contradictions": doc.get("contradictions", []),
        "requested_markers": doc.get("requested_markers", []),
        "doctor_opinions": doc.get("doctor_opinions", []),
        "top_insights": top_insights,
        "tracker_averages": tracker_averages(logs),
    }
