"""LE-RAG: Longitudinal Evidence RAG (brief Sec 5, steps 2-6; Task 15).

Pipeline per patient:
  1. theme_stats + gate      -- pure; count every chunk of a theme (embedded
                                or not) and keep themes with >= MIN_OCCURRENCES
                                chunks from >= MIN_SOURCE_TYPES source types.
  2. retrieve                -- Atlas $vectorSearch on the theme's query_text,
                                filtered to this patient + theme.
  3. grounded prompt         -- the TOP_K chunks as [E1]..[E6], nothing else.
  4. guard + citation filter -- non_diagnostic_guard on every string, one
                                stricter retry, unknown E# ids dropped.
  5. confidence              -- pure weighted score, flagged below TAU.
  6. cache                   -- upsert into `insights` keyed (patient_id, theme).

Privacy: logs carry counts/latencies only -- never chunk text, prompts or
model output.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta

from bson import ObjectId

from services.embeddings import EmbeddingUnavailable, embed_query
from services.llm import LLMUnavailable, generate
from services.safety import non_diagnostic_guard
from services.themes import THEMES

logger = logging.getLogger("echocare.le_rag")

# ── Constants (reported in the academic write-up) ────────────────────────────
MIN_OCCURRENCES = 3      # gate: chunks tagged with the theme
MIN_SOURCE_TYPES = 2     # gate: distinct source_type among those chunks
MAX_THEMES = 5           # themes generated per refresh (latency budget)
TOP_K = 6                # chunks retrieved per theme -> [E1]..[E6]
NUM_CANDIDATES = 100     # $vectorSearch numCandidates
MIN_RETRIEVED = 2        # fewer embedded hits -> "awaiting_embeddings"
W_SIMILARITY = 0.35
W_DIVERSITY = 0.25
W_OCCURRENCE = 0.20
W_TEMPORAL = 0.20
TAU = 0.55               # low_confidence threshold
NUM_SOURCE_TYPES = 4     # narrative, survey, tracker, report
OCCURRENCE_WINDOW_DAYS = 30
EXCERPT_CHARS = 160
VECTOR_INDEX = "evidence_vector_idx"

SYSTEM_PROMPT = (
    "You help a patient prepare for a conversation with a licensed clinician. "
    "You never diagnose. Only use the evidence provided. "
    "Every statement must be traceable to a numbered evidence item.\n"
    "Describe patterns you see in the evidence in plain, non-diagnostic language. "
    "Do not say the patient has any disease, disorder or condition, and do not "
    "recommend medicines or doses. Mark each statement with the evidence ids it "
    "relies on, e.g. [E1][E3].\n"
    "Respond with a single JSON object and nothing else:\n"
    '{"title": "short neutral title", "observation": "2-3 sentences", '
    '"discussion_points": ["..."], "questions_for_clinician": ["..."], '
    '"cited": ["E1", "..."]}\n'
    '"cited" lists every evidence id your statements rely on.'
)
STRICT_SUFFIX = (
    "\nIMPORTANT: a previous answer used diagnostic wording. Do not name, suggest "
    "or imply any diagnosis, disease or condition, and give no medication or "
    "dosage advice. Only describe what the evidence items show and what the "
    "patient could ask their clinician."
)
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "observation": {"type": "string"},
        "discussion_points": {"type": "array", "items": {"type": "string"}},
        "questions_for_clinician": {"type": "array", "items": {"type": "string"}},
        "cited": {"type": "array", "items": {"type": "string"}},
    },
}

_QUERY_VECTORS: dict[str, list[float]] = {}


# ── Pure functions: gate, confidence, output validation ─────────────────────

def theme_stats(chunks: list[dict]) -> list[dict]:
    """Group chunk metadata ({theme_tags, source_type, timestamp}) by theme."""
    stats: dict[str, dict] = {}
    for c in chunks:
        for theme in c.get("theme_tags") or []:
            s = stats.setdefault(theme, {"theme": theme, "count": 0, "source_types": set(), "timestamps": []})
            s["count"] += 1
            s["source_types"].add(c["source_type"])
            s["timestamps"].append(c["timestamp"])
    for s in stats.values():
        s["source_types"] = sorted(s["source_types"])
    return list(stats.values())


def gate(stats: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split themes into (passed ranked by count desc, gated_out explanations).
    The evidence gate is never bypassed -- there is no flag to skip it."""
    passed, gated_out = [], []
    for s in stats:
        if s["count"] >= MIN_OCCURRENCES and len(s["source_types"]) >= MIN_SOURCE_TYPES:
            passed.append(s)
        else:
            gated_out.append({
                "theme": s["theme"],
                "count": s["count"],
                "source_types": s["source_types"],
                "needed": {"occurrences": MIN_OCCURRENCES, "source_types": MIN_SOURCE_TYPES},
                "reason": "insufficient_evidence",
            })
    passed.sort(key=lambda s: s["count"], reverse=True)
    gated_out.sort(key=lambda g: g["count"], reverse=True)
    return passed, gated_out


def temporal_consistency(timestamps: list[datetime]) -> float:
    """Weeks with >= 1 occurrence / weeks spanned first..last (min 1 week).
    Weeks are 7-day buckets anchored at the first occurrence's date."""
    if not timestamps:
        return 0.0
    first = min(timestamps).date()
    weeks = {(t.date() - first).days // 7 for t in timestamps}
    return len(weeks) / (max(weeks) + 1)


def confidence(
    cited_scores: list[float],
    retrieved_source_types: list[str],
    theme_timestamps: list[datetime],
    all_timestamps: list[datetime],
    now: datetime,
) -> dict:
    avg_similarity = sum(cited_scores) / len(cited_scores) if cited_scores else 0.0
    source_diversity = len(set(retrieved_source_types)) / NUM_SOURCE_TYPES
    cutoff = now - timedelta(days=OCCURRENCE_WINDOW_DAYS)
    theme_days = {t.date() for t in theme_timestamps if t >= cutoff}
    any_days = {t.date() for t in all_timestamps if t >= cutoff}
    occurrence_rate = min(1.0, len(theme_days) / len(any_days)) if any_days else 0.0
    temporal = temporal_consistency(theme_timestamps)
    score = (
        W_SIMILARITY * avg_similarity
        + W_DIVERSITY * source_diversity
        + W_OCCURRENCE * occurrence_rate
        + W_TEMPORAL * temporal
    )
    return {
        "confidence": round(score, 3),
        "low_confidence": score < TAU,
        "components": {
            "avg_similarity": round(avg_similarity, 3),
            "source_diversity": round(source_diversity, 3),
            "occurrence_rate": round(occurrence_rate, 3),
            "temporal_consistency": round(temporal, 3),
        },
    }


def validate_output(parsed: dict | None, valid_ids: set[str]) -> tuple[dict | None, str | None]:
    """Returns (clean fields, None) or (None, reason) with reason in
    {"malformed", "diagnostic", "no_citations"}."""
    if not isinstance(parsed, dict):
        return None, "malformed"
    title, observation = parsed.get("title"), parsed.get("observation")
    if not isinstance(title, str) or not isinstance(observation, str) or not title.strip() or not observation.strip():
        return None, "malformed"
    points = [p for p in parsed.get("discussion_points") or [] if isinstance(p, str) and p.strip()]
    questions = [q for q in parsed.get("questions_for_clinician") or [] if isinstance(q, str) and q.strip()]
    if any(non_diagnostic_guard(s) for s in [title, observation, *points, *questions]):
        return None, "diagnostic"
    cited: list[str] = []
    for c in parsed.get("cited") or []:
        cid = str(c).strip().strip("[]").upper()
        if cid in valid_ids and cid not in cited:
            cited.append(cid)
    if not cited:
        return None, "no_citations"
    return {
        "title": title.strip(),
        "observation": observation.strip(),
        "discussion_points": points,
        "questions_for_clinician": questions,
        "cited": cited,
    }, None


def build_user_prompt(theme: str, evidence: list[dict]) -> str:
    lines = [f"Theme: {theme.replace('_', ' ')}", "Evidence:"]
    for e in evidence:
        lines.append(f"[{e['id']}] ({e['source_type']}, {e['timestamp'].date().isoformat()}) {e['text']}")
    return "\n".join(lines)


# ── DB-facing pipeline ───────────────────────────────────────────────────────

async def load_gate(db, patient_id: ObjectId) -> tuple[list[dict], list[dict], list[dict]]:
    """Returns (passed, gated_out, chunk metadata). Counts use ALL chunks,
    including ones still waiting for an embedding."""
    chunks = await db.evidence_chunks.find(
        {"patient_id": patient_id}, {"theme_tags": 1, "source_type": 1, "timestamp": 1}
    ).to_list(length=None)
    passed, gated_out = gate(theme_stats(chunks))
    return passed, gated_out, chunks


async def _retrieve(db, patient_id: ObjectId, theme: str) -> list[dict]:
    vector = _QUERY_VECTORS.get(theme)
    if vector is None:
        vector = _QUERY_VECTORS[theme] = await embed_query(THEMES[theme]["query_text"])
    pipeline = [
        {"$vectorSearch": {
            "index": VECTOR_INDEX,
            "path": "embedding",
            "queryVector": vector,
            "numCandidates": NUM_CANDIDATES,
            "limit": TOP_K,
            "filter": {"patient_id": patient_id, "theme_tags": theme},
        }},
        {"$project": {"text": 1, "source_type": 1, "timestamp": 1, "score": {"$meta": "vectorSearchScore"}}},
    ]
    return await db.evidence_chunks.aggregate(pipeline).to_list(length=TOP_K)


async def _generate(theme: str, evidence: list[dict]) -> tuple[dict | None, str | None, str | None]:
    """One call, plus one stricter retry if the guard fires."""
    user = build_user_prompt(theme, evidence)
    valid_ids = {e["id"] for e in evidence}
    system, provider, reason = SYSTEM_PROMPT, None, None
    for _ in range(2):
        result = await generate("insight", system, [{"role": "user", "content": user}], json_schema=OUTPUT_SCHEMA)
        provider = result["provider"]
        fields, reason = validate_output(result["parsed"], valid_ids)
        if reason != "diagnostic":
            return fields, reason, provider
        system = SYSTEM_PROMPT + STRICT_SUFFIX
    return None, reason, provider


async def _process_theme(db, patient_id: ObjectId, stat: dict, all_ts: list[datetime], now: datetime) -> dict:
    theme = stat["theme"]
    try:
        hits = await _retrieve(db, patient_id, theme)
        if len(hits) < MIN_RETRIEVED:
            return {"theme": theme, "status": "awaiting_embeddings"}
        evidence = [{"id": f"E{i + 1}", **h} for i, h in enumerate(hits)]
        fields, reason, provider = await _generate(theme, evidence)
    except (LLMUnavailable, EmbeddingUnavailable) as exc:
        logger.warning("patient_id=%s theme_unavailable error=%s", patient_id, type(exc).__name__)
        return {"theme": theme, "status": "unavailable"}
    if fields is None:
        return {"theme": theme, "status": "dropped", "reason": reason}

    cited = [e for e in evidence if e["id"] in fields["cited"]]
    conf = confidence(
        [e["score"] for e in cited], [e["source_type"] for e in evidence], stat["timestamps"], all_ts, now
    )
    summary: dict = {}
    for e in cited:
        summary[e["source_type"]] = summary.get(e["source_type"], 0) + 1
    dates = sorted(e["timestamp"].date().isoformat() for e in cited)
    summary.update({"from": dates[0], "to": dates[-1]})

    doc = {
        "patient_id": patient_id,
        "theme": theme,
        "title": fields["title"],
        "observation": fields["observation"],
        "discussion_points": fields["discussion_points"],
        "questions_for_clinician": fields["questions_for_clinician"],
        "cited": fields["cited"],
        "chunk_ids": [str(e["_id"]) for e in cited],
        "evidence": [
            {
                "id": e["id"],
                "chunk_id": str(e["_id"]),
                "source_type": e["source_type"],
                "date": e["timestamp"].date().isoformat(),
                "excerpt": e["text"][:EXCERPT_CHARS],
                "score": round(e["score"], 3),
            }
            for e in cited
        ],
        "evidence_summary": summary,
        "occurrences": stat["count"],
        "source_types": stat["source_types"],
        **conf,
        "generated_at": now,
        "provider": provider,
    }
    await db.insights.update_one({"patient_id": patient_id, "theme": theme}, {"$set": doc}, upsert=True)
    return {"theme": theme, "status": "ok"}


async def refresh(db, patient_id: ObjectId) -> dict:
    """Run the full pipeline. Raises LLMUnavailable (-> 503) only when every
    processed theme failed for lack of an AI provider."""
    start = time.monotonic()
    passed, gated_out, chunks = await load_gate(db, patient_id)
    await db.insights.delete_many({"patient_id": patient_id, "theme": {"$nin": [s["theme"] for s in passed]}})

    now = datetime.utcnow()
    all_ts = [c["timestamp"] for c in chunks]
    targets = passed[:MAX_THEMES]
    results = await asyncio.gather(*(_process_theme(db, patient_id, s, all_ts, now) for s in targets))

    statuses = [r["status"] for r in results]
    logger.info(
        "patient_id=%s refresh themes=%d ok=%d dropped=%d awaiting=%d unavailable=%d latency_ms=%d",
        patient_id, len(targets), statuses.count("ok"), statuses.count("dropped"),
        statuses.count("awaiting_embeddings"), statuses.count("unavailable"),
        int((time.monotonic() - start) * 1000),
    )
    if results and all(s == "unavailable" for s in statuses):
        raise LLMUnavailable("no provider for any insight theme")

    by_theme = {s["theme"]: s for s in passed}
    for r in results:
        if r["status"] == "awaiting_embeddings":
            s = by_theme[r["theme"]]
            gated_out.append({
                "theme": s["theme"], "count": s["count"], "source_types": s["source_types"],
                "needed": {"occurrences": MIN_OCCURRENCES, "source_types": MIN_SOURCE_TYPES},
                "reason": "awaiting_embeddings",
            })
    dropped = [{"theme": r["theme"], "reason": r["reason"]} for r in results if r["status"] == "dropped"]
    unavailable = [r["theme"] for r in results if r["status"] == "unavailable"]
    return {"gated_out": gated_out, "dropped": dropped, "unavailable": unavailable}


async def cached(db, patient_id: ObjectId) -> dict:
    """Cached insights + stale flag + gate explanations (no AI calls)."""
    passed, gated_out, _ = await load_gate(db, patient_id)
    docs = await db.insights.find({"patient_id": patient_id}).sort("confidence", -1).to_list(length=None)
    if docs:
        # ObjectId encodes insertion time, so backdated chunks (e.g. a tracker
        # entry for last week added today) still mark insights stale.
        oldest = min(d["generated_at"] for d in docs)
        newer = await db.evidence_chunks.find_one(
            {"patient_id": patient_id, "_id": {"$gt": ObjectId.from_datetime(oldest)}}, {"_id": 1}
        )
        stale = newer is not None
    else:
        stale = bool(passed)
    insights = []
    for d in docs:
        d.pop("patient_id", None)
        d["id"] = str(d.pop("_id"))
        d["generated_at"] = d["generated_at"].isoformat() + "Z"
        insights.append(d)
    return {"insights": insights, "stale": stale, "gated_out": gated_out}
