"""Evidence chunking + embedding-on-write for LE-RAG (Task 13/14).

Every piece of patient data (survey, tracker, report, story) becomes one or
more rows in evidence_chunks: {_id, patient_id, source_type, source_ref,
text, text_hash, embedding, needs_embedding, theme_tags, timestamp,
metadata}. Chunk builders (chunk_* below) are pure functions; upsert_chunks
does the hash-dedupe + embed + write. Callers (routers, via BackgroundTasks)
must not let this fail the user's save -- embedding failure is swallowed
into needs_embedding=True, and callers should wrap the whole call in
try/except as a second line of defense.
"""
import hashlib
import logging
import re
from datetime import datetime
from typing import Any, TypedDict

from bson import ObjectId
from pymongo.errors import BulkWriteError

from services.embeddings import EmbeddingUnavailable, embed
from services.themes import tag_text, tag_tracker_log

logger = logging.getLogger("echocare.evidence")

_MIN_PASSAGE = 300
_MAX_PASSAGE = 600
_REPORT_PASSAGE = 600

_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_CAMEL_RE = re.compile(r"(?<!^)(?=[A-Z])")


class ChunkItem(TypedDict):
    text: str
    theme_tags: list[str]
    metadata: dict[str, Any]


# ── Text helpers ─────────────────────────────────────────────────────────────

def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]


def _group_passages(sentences: list[str], max_len: int = _MAX_PASSAGE) -> list[str]:
    """Group sentences into passages up to max_len chars, never splitting a
    sentence across two passages."""
    passages: list[str] = []
    current = ""
    for sent in sentences:
        if current and len(current) + 1 + len(sent) > max_len:
            passages.append(current)
            current = sent
        else:
            current = f"{current} {sent}".strip() if current else sent
    if current:
        passages.append(current)
    return passages


def humanize_key(key: str) -> str:
    """camelCase field id -> readable label, e.g. symptomDuration -> Symptom Duration."""
    if not key:
        return key
    words = [w for w in _CAMEL_RE.split(key) if w]
    return " ".join(w[:1].upper() + w[1:] for w in words)


def _render_answer(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        items = [str(v).strip() for v in value if str(v).strip()]
        return ", ".join(items) if items else None
    text = str(value).strip()
    return text or None


# ── Chunk builders ───────────────────────────────────────────────────────────

def chunk_survey(survey_data: dict) -> list[ChunkItem]:
    """One chunk per answered field, "<label>: <answer>"; empty answers skipped."""
    items: list[ChunkItem] = []
    for key, raw_value in (survey_data or {}).items():
        answer = _render_answer(raw_value)
        if answer is None:
            continue
        text = f"{humanize_key(key)}: {answer}"
        items.append({"text": text, "theme_tags": tag_text(text), "metadata": {"survey_field": key}})
    return items


def chunk_tracker(log: dict) -> list[ChunkItem]:
    """One chunk per tracker day, rendered as a sentence (plan Sec 13)."""
    date = log.get("date")
    parts = [f"On {date}: energy {log.get('energy')}/10, pain {log.get('pain')}/10, stress {log.get('stress')}/10"]
    sleep_hours = log.get("sleep_hours")
    if sleep_hours is not None:
        parts[0] += f", slept {sleep_hours}h"
    water = log.get("water_glasses")
    if water is not None:
        parts[0] += f", {water} glasses of water"
    mood = log.get("mood")
    if mood:
        parts[0] += f", mood {mood}"
    sentence = parts[0] + "."

    symptoms = log.get("symptoms") or []
    if symptoms:
        sentence += f" Symptoms: {', '.join(symptoms)}."

    for field, label in (("diet", "Diet"), ("activity", "Activity"), ("medication", "Medication")):
        value = log.get(field)
        if value:
            sentence += f" {label}: {value}."

    notes = (log.get("notes") or "").strip()
    if notes:
        sentence += f" Note: {notes}"

    return [{"text": sentence, "theme_tags": tag_tracker_log(log), "metadata": {}}]


def chunk_story(story_text: str, analyzed_at: datetime | None = None) -> list[ChunkItem]:
    """Sentence-grouped ~300-600 char passages. Exposed as a function only --
    called from the Analyze endpoint (Task 16), not on draft autosave."""
    sentences = _split_sentences(story_text or "")
    passages = _group_passages(sentences)
    return [{"text": p, "theme_tags": tag_text(p), "metadata": {}} for p in passages]


def chunk_report(report_id: str, extracted_text: str) -> list[ChunkItem]:
    """~600-char passages of extracted_text. Field-level chunks land in a
    later task (Task 29) once field extraction exists."""
    sentences = _split_sentences(extracted_text or "")
    passages = _group_passages(sentences, max_len=_REPORT_PASSAGE)
    return [
        {"text": p, "theme_tags": tag_text(p), "metadata": {"report_id": report_id}}
        for p in passages
    ]


# ── Write path ───────────────────────────────────────────────────────────────

async def upsert_chunks(
    db,
    patient_id: ObjectId,
    source_type: str,
    source_ref: str,
    items: list[ChunkItem],
    timestamp: datetime | None = None,
) -> dict:
    """Replace the chunk set for (patient_id, source_type, source_ref) with
    `items`, by content hash: unchanged text is left alone (not
    re-embedded), removed text is deleted, new text is embedded + inserted.

    Never raises on embedding failure -- new chunks are stored with
    embedding=None, needs_embedding=True instead.
    """
    timestamp = timestamp or datetime.utcnow()
    collection = db.evidence_chunks

    # De-dupe identical text within this call (e.g. two survey fields with
    # the same answer) -- keep the first occurrence's tags/metadata.
    by_hash: dict[str, ChunkItem] = {}
    for item in items:
        h = _text_hash(item["text"])
        by_hash.setdefault(h, item)

    existing_hashes: set[str] = set()
    async for doc in collection.find(
        {"patient_id": patient_id, "source_type": source_type, "source_ref": source_ref},
        {"text_hash": 1},
    ):
        existing_hashes.add(doc["text_hash"])

    new_hashes = set(by_hash.keys())
    to_delete = existing_hashes - new_hashes
    to_insert_hashes = new_hashes - existing_hashes

    if to_delete:
        await collection.delete_many(
            {
                "patient_id": patient_id,
                "source_type": source_type,
                "source_ref": source_ref,
                "text_hash": {"$in": list(to_delete)},
            }
        )

    inserted = 0
    if to_insert_hashes:
        to_insert = [by_hash[h] for h in to_insert_hashes]
        embeddings: list[list[float]] | None = None
        try:
            embeddings = await embed([it["text"] for it in to_insert])
        except EmbeddingUnavailable as exc:
            logger.warning("embedding unavailable for source_type=%s source_ref=%s error=%s", source_type, source_ref, type(exc).__name__)

        docs = []
        for i, item in enumerate(to_insert):
            vector = embeddings[i] if embeddings else None
            docs.append(
                {
                    "patient_id": patient_id,
                    "source_type": source_type,
                    "source_ref": source_ref,
                    "text": item["text"],
                    "text_hash": _text_hash(item["text"]),
                    "embedding": vector,
                    "needs_embedding": vector is None,
                    "theme_tags": item["theme_tags"],
                    "timestamp": timestamp,
                    "metadata": item["metadata"],
                }
            )
        if docs:
            try:
                result = await collection.insert_many(docs, ordered=False)
                inserted = len(result.inserted_ids)
            except BulkWriteError as exc:
                # A concurrent save already inserted the same chunk (unique index); anything else is real.
                if any(err.get("code") != 11000 for err in exc.details.get("writeErrors", [])):
                    raise
                inserted = exc.details.get("nInserted", 0)

    return {"inserted": inserted, "deleted": len(to_delete), "unchanged": len(existing_hashes & new_hashes)}


# ── Router-facing convenience wrappers (safe to call from BackgroundTasks) ──

async def store_survey_chunks(db, patient_id: ObjectId, survey_data: dict) -> None:
    try:
        items = chunk_survey(survey_data)
        await upsert_chunks(db, patient_id, "survey", "survey", items)
    except Exception:
        logger.exception("store_survey_chunks failed for patient_id=%s", patient_id)


def tracker_timestamp(log: dict) -> datetime | None:
    """A tracker chunk is evidence for the logged day, not the save time --
    LE-RAG's occurrence/temporal scores depend on this."""
    try:
        return datetime.fromisoformat(log.get("date"))
    except (TypeError, ValueError):
        return None


async def store_tracker_chunks(db, patient_id: ObjectId, log: dict) -> None:
    try:
        items = chunk_tracker(log)
        await upsert_chunks(db, patient_id, "tracker", log.get("date"), items, timestamp=tracker_timestamp(log))
    except Exception:
        logger.exception("store_tracker_chunks failed for patient_id=%s", patient_id)


async def store_report_chunks(db, patient_id: ObjectId, report_id: str, extracted_text: str) -> None:
    try:
        items = chunk_report(report_id, extracted_text)
        await upsert_chunks(db, patient_id, "report", report_id, items)
    except Exception:
        logger.exception("store_report_chunks failed for patient_id=%s", patient_id)


async def store_story_chunks(db, patient_id: ObjectId, story_text: str, analyzed_at: datetime | None = None) -> None:
    """Not wired into any router yet -- called from the Analyze endpoint (Task 16)."""
    try:
        items = chunk_story(story_text, analyzed_at)
        await upsert_chunks(db, patient_id, "narrative", "story", items, timestamp=analyzed_at)
    except Exception:
        logger.exception("store_story_chunks failed for patient_id=%s", patient_id)


def chunk_opinion(opinion_id: str, doctor: str, specialty: str, opinion_text: str) -> list[ChunkItem]:
    """A doctor opinion is evidence too (Task 19): chunked like a report
    (source_type stays "report", the four-value enum is unchanged) but
    tagged metadata.kind="opinion" so it can be told apart from uploaded
    lab reports -- used by find_gaps' addressed-by check and by
    contradiction detection."""
    sentences = _split_sentences(opinion_text or "")
    passages = _group_passages(sentences, max_len=_REPORT_PASSAGE)
    metadata = {"kind": "opinion", "opinion_id": opinion_id, "doctor": doctor, "specialty": specialty}
    return [{"text": p, "theme_tags": tag_text(p), "metadata": metadata} for p in passages]


async def store_opinion_chunks(
    db, patient_id: ObjectId, opinion_id: str, doctor: str, specialty: str, opinion_text: str,
    timestamp: datetime | None = None,
) -> None:
    try:
        items = chunk_opinion(opinion_id, doctor, specialty, opinion_text)
        await upsert_chunks(db, patient_id, "report", f"opinion:{opinion_id}", items, timestamp=timestamp)
    except Exception:
        logger.exception("store_opinion_chunks failed for patient_id=%s", patient_id)


async def delete_chunks_by_source(db, patient_id: ObjectId, source_type: str, source_ref: str) -> None:
    """Remove every chunk for (patient_id, source_type, source_ref) -- used when a
    doctor opinion (or any other single-source item) is deleted."""
    await db.evidence_chunks.delete_many(
        {"patient_id": patient_id, "source_type": source_type, "source_ref": source_ref}
    )
