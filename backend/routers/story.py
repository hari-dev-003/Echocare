import logging
import os
import io
import json
import re
from fastapi import APIRouter, BackgroundTasks, Depends, Request, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from datetime import datetime
from database import get_db
from limiter import limiter
from routers.auth import get_current_user
from services import le_rag
from services.evidence import store_report_chunks, store_story_chunks
from services.llm import LLMUnavailable, generate
from services.safety import check_emergency, non_diagnostic_guard

router = APIRouter(prefix="/api/story", tags=["story"])
logger = logging.getLogger("echocare.story")

MAX_REPORT_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_STORY_CHARS = 20_000
PDF_MAGIC = b"%PDF-"

STORY_SYSTEM_PROMPT = (
    "You extract structure from a patient's own health story. You never diagnose "
    "and never suggest treatments. Only use facts stated in the story -- do not "
    "invent symptoms, dates or events.\n"
    "For every symptom and every timeline event, include a `quote` field that is "
    "copied VERBATIM (exact substring) from the story text -- this is used to "
    "verify you did not invent it. If you cannot find an exact quote, omit that item.\n"
    "Respond with a single JSON object and nothing else:\n"
    '{"symptoms": [{"name": "...", "onset": "...", "severity": "mild|moderate|severe|unclear", "quote": "..."}], '
    '"timeline": [{"when": "...", "event": "...", "quote": "..."}], '
    '"emotional_themes": ["..."], "pain_points": ["..."], "open_questions": ["..."]}'
)

STORY_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "symptoms": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "onset": {"type": "string"},
                    "severity": {"type": "string", "enum": ["mild", "moderate", "severe", "unclear"]},
                    "quote": {"type": "string"},
                },
            },
        },
        "timeline": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "when": {"type": "string"},
                    "event": {"type": "string"},
                    "quote": {"type": "string"},
                },
            },
        },
        "emotional_themes": {"type": "array", "items": {"type": "string"}},
        "pain_points": {"type": "array", "items": {"type": "string"}},
        "open_questions": {"type": "array", "items": {"type": "string"}},
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_pdf_text(file_bytes: bytes) -> tuple[str, str]:
    """Extract plain text from PDF using PyMuPDF (fitz).

    Returns (text, extraction_status). On failure, returns ("", "failed")
    instead of leaking the exception message into stored report text.
    """
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text.strip(), "ok"
    except Exception:
        return "", "failed"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def _clean_generated(text: Any) -> Optional[str]:
    """Keep an LLM-generated string only if it's non-empty and passes the
    non-diagnostic guard (constraint 1: every generated string is checked)."""
    if not isinstance(text, str) or not text.strip():
        return None
    if non_diagnostic_guard(text):
        return None
    return text.strip()


def filter_story_extraction(extraction: Dict[str, Any], story_text: str) -> Dict[str, Any]:
    """Drop symptoms/timeline items whose `quote` isn't a verbatim (whitespace/
    case-insensitive) substring of the story, and any generated string that
    trips the non-diagnostic guard."""
    story_norm = _normalize(story_text)

    symptoms = []
    for item in extraction.get("symptoms") or []:
        if not isinstance(item, dict):
            continue
        quote = item.get("quote")
        if not isinstance(quote, str) or _normalize(quote) not in story_norm:
            continue
        name = _clean_generated(item.get("name"))
        if not name:
            continue
        severity = item.get("severity") if item.get("severity") in ("mild", "moderate", "severe", "unclear") else "unclear"
        symptoms.append({"name": name, "onset": _clean_generated(item.get("onset")) or "", "severity": severity, "quote": quote.strip()})

    timeline = []
    for item in extraction.get("timeline") or []:
        if not isinstance(item, dict):
            continue
        quote = item.get("quote")
        if not isinstance(quote, str) or _normalize(quote) not in story_norm:
            continue
        event = _clean_generated(item.get("event"))
        if not event:
            continue
        timeline.append({"when": _clean_generated(item.get("when")) or "", "event": event, "quote": quote.strip()})

    emotional_themes = [s for s in (_clean_generated(t) for t in extraction.get("emotional_themes") or []) if s]
    pain_points = [s for s in (_clean_generated(t) for t in extraction.get("pain_points") or []) if s]
    open_questions = [s for s in (_clean_generated(t) for t in extraction.get("open_questions") or []) if s]

    return {
        "symptoms": symptoms,
        "timeline": timeline,
        "emotional_themes": emotional_themes,
        "pain_points": pain_points,
        "open_questions": open_questions,
    }


def map_extraction_to_analysis(extraction: Dict[str, Any]) -> Dict[str, Any]:
    """Map the story-extraction schema onto the frontend's `Analysis` shape
    (src/app/story/page.tsx) so the page's rendering code stays unchanged."""
    symptoms = extraction["symptoms"]
    timeline = extraction["timeline"]
    detected_symptoms = [s["name"] for s in symptoms]
    source_timeline = [{"week": t["when"], "event": t["event"]} for t in timeline]
    timeline_str = "; ".join(f"{t['when']}: {t['event']}".strip(": ") for t in timeline if t["when"] or t["event"])
    total_items = len(detected_symptoms) + len(timeline) + len(extraction["emotional_themes"]) + len(extraction["pain_points"])

    return {
        "detectedSymptoms": detected_symptoms,
        "timeline": timeline_str or "No clear timeline detected yet -- add more detail about when things started.",
        "emotionalThemes": extraction["emotional_themes"],
        "painPoints": extraction["pain_points"],
        "lifestylePatterns": [],
        "suggestedDepartments": [],
        "patternSummary": (
            f"Identified {len(detected_symptoms)} symptom(s) and {len(timeline)} timeline event(s) from your story."
            if total_items
            else "Add more detail about your symptoms and when they started for a fuller picture."
        ),
        "urgencyLevel": "low",
        "recommendedActions": extraction["open_questions"],
        "confidenceScore": min(95, 40 + total_items * 4),
        "sourceTimeline": source_timeline,
        "clinicalGaps": [],
    }


async def _refresh_insights_background(patient_id) -> None:
    """BackgroundTasks target -- must never raise (nothing awaits this)."""
    try:
        await le_rag.refresh(get_db(), patient_id)
    except Exception:
        logger.exception("background insights refresh failed for patient_id=%s", patient_id)


# ── Schemas ───────────────────────────────────────────────────────────────────

class StoryDraft(BaseModel):
    story_text: str


class StoryAnalyzeRequest(BaseModel):
    story_text: str = Field(min_length=1, max_length=MAX_STORY_CHARS)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/latest")
async def get_story(current_user: dict = Depends(get_current_user)):
    """Load the user's saved patient story draft."""
    db = get_db()
    story = await db.stories.find_one({"user_email": current_user["email"]})
    if not story:
        return {"story_text": "", "analysis": None}
    story["_id"] = str(story["_id"])
    return story


@router.post("/save-draft")
async def save_draft(data: StoryDraft, current_user: dict = Depends(get_current_user)):
    """Autosave the story text (debounced from frontend)."""
    db = get_db()
    doc = {
        "user_email": current_user["email"],
        "story_text": data.story_text,
        "updated_at": datetime.utcnow().isoformat(),
    }
    await db.stories.update_one(
        {"user_email": current_user["email"]},
        {"$set": doc},
        upsert=True,
    )
    return {"success": True}


@router.post("/analyze")
@limiter.limit("5/minute;30/day")
async def analyze_story(
    request: Request,
    data: StoryAnalyzeRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Safety check -> save -> chunk -> LLM extraction -> quote-verify -> persist.

    Emergency hit short-circuits: the story is saved (the user typed it) but
    nothing else runs. Otherwise the story is chunked+embedded *before* the
    LLM call, so if the LLM is unavailable (-> 503 via the LLMUnavailable
    handler in main.py) the text and its evidence chunks are already saved.
    """
    db = get_db()
    story_text = data.story_text

    await db.stories.update_one(
        {"user_email": current_user["email"]},
        {"$set": {"user_email": current_user["email"], "story_text": story_text, "updated_at": datetime.utcnow().isoformat()}},
        upsert=True,
    )

    escalation = check_emergency(story_text)
    if escalation:
        return {"escalation": escalation}

    await store_story_chunks(db, current_user["_id"], story_text)

    result = await generate(
        "story",
        STORY_SYSTEM_PROMPT,
        [{"role": "user", "content": f"Patient story:\n{story_text}"}],
        json_schema=STORY_ANALYSIS_SCHEMA,
        max_tokens=1200,
    )
    extraction = filter_story_extraction(result["parsed"] or {}, story_text)
    analysis = map_extraction_to_analysis(extraction)

    await db.stories.update_one(
        {"user_email": current_user["email"]},
        {"$set": {"analysis": analysis, "analyzed_at": datetime.utcnow().isoformat()}},
    )

    background_tasks.add_task(_refresh_insights_background, current_user["_id"])
    return analysis


@router.post("/upload-report")
async def upload_report(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doctor: str = Form(""),
    specialty: str = Form(""),
    report_type: str = Form("Lab report"),
    report_date: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """
    Accept a PDF report, extract text with PyMuPDF, save metadata to MongoDB.
    Returns the extracted text so the frontend can display it immediately.
    No Cloudinary needed — we store metadata in MongoDB and text inline.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await file.read(MAX_REPORT_BYTES + 1)
    if len(file_bytes) > MAX_REPORT_BYTES:
        raise HTTPException(status_code=413, detail="Report file too large (max 10 MB).")
    if not file_bytes.startswith(PDF_MAGIC):
        raise HTTPException(status_code=400, detail="File is not a valid PDF.")

    extracted_text, extraction_status = extract_pdf_text(file_bytes)

    db = get_db()
    doc = {
        "user_email": current_user["email"],
        "filename": file.filename,
        "doctor": doctor,
        "specialty": specialty,
        "report_type": report_type,
        "report_date": report_date or datetime.utcnow().strftime("%Y-%m-%d"),
        "extracted_text": extracted_text,
        "extraction_status": extraction_status,
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    result = await db.reports.insert_one(doc)
    report_id = str(result.inserted_id)

    background_tasks.add_task(store_report_chunks, db, current_user["_id"], report_id, extracted_text)

    return {
        "id": report_id,
        "filename": file.filename,
        "extracted_text": extracted_text,
        "extraction_status": extraction_status,
        "report_type": report_type,
        "cloudinary_url": None,   # not using Cloudinary — text stored in DB
    }


@router.get("/reports")
async def get_reports(current_user: dict = Depends(get_current_user)):
    """List all uploaded reports for the user."""
    db = get_db()
    cursor = db.reports.find(
        {"user_email": current_user["email"]},
        sort=[("uploaded_at", -1)],
    ).limit(20)

    reports = []
    async for r in cursor:
        r["_id"] = str(r["_id"])
        reports.append(r)
    return reports


def _demo() -> None:
    """Self-check for the quote-verification gate (Task 16 acceptance:
    every persisted quote must exist verbatim in the story)."""
    story = "I have felt   Fatigue and joint pain since March. It got worse in June."
    extraction = {
        "symptoms": [
            {"name": "Fatigue", "onset": "March", "severity": "moderate", "quote": "felt   Fatigue and joint pain"},
            {"name": "Fabricated", "onset": "never happened", "severity": "severe", "quote": "this text is not in the story"},
        ],
        "timeline": [
            {"when": "June", "event": "Got worse", "quote": "it got worse in june"},
        ],
        "emotional_themes": ["frustration"],
        "pain_points": ["you are suffering from arthritis"],  # should be dropped by the guard
        "open_questions": ["what tests should I ask for?"],
    }
    result = filter_story_extraction(extraction, story)
    assert len(result["symptoms"]) == 1 and result["symptoms"][0]["name"] == "Fatigue", result["symptoms"]
    assert len(result["timeline"]) == 1, result["timeline"]
    assert result["pain_points"] == [], "diagnostic-sounding pain point should have been dropped"

    mapped = map_extraction_to_analysis(result)
    assert mapped["detectedSymptoms"] == ["Fatigue"]
    assert mapped["urgencyLevel"] == "low"
    print("story._demo: all assertions passed")


if __name__ == "__main__":
    _demo()
