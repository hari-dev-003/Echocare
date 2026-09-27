"""Back-fill evidence_chunks for existing survey/tracker/report/story data,
and retry embedding for any chunk stored with needs_embedding=True.

Run: cd backend && uv run python scripts/backfill_chunks.py

Idempotent: upsert_chunks dedupes by (patient_id, source_type, source_ref,
text_hash), so re-running only inserts what changed. Never prints patient
text -- counts only.
"""
import asyncio
import sys

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0])

from database import close_db, connect_db, get_db  # noqa: E402
from services.embeddings import EmbeddingUnavailable, embed  # noqa: E402
from services.evidence import (  # noqa: E402
    chunk_report,
    chunk_story,
    chunk_survey,
    chunk_tracker,
    tracker_timestamp,
    upsert_chunks,
)


async def retry_needs_embedding(db) -> dict:
    docs = await db.evidence_chunks.find({"needs_embedding": True}).to_list(length=None)
    if not docs:
        return {"retried": 0, "embedded": 0}
    try:
        vectors = await embed([d["text"] for d in docs])
    except EmbeddingUnavailable:
        return {"retried": len(docs), "embedded": 0}
    for doc, vector in zip(docs, vectors):
        await db.evidence_chunks.update_one(
            {"_id": doc["_id"]}, {"$set": {"embedding": vector, "needs_embedding": False}}
        )
    return {"retried": len(docs), "embedded": len(docs)}


async def backfill_user(db, user) -> dict:
    patient_id = user["_id"]
    email = user["email"]
    counts = {"survey": 0, "tracker": 0, "report": 0, "narrative": 0}

    survey = await db.surveys.find_one({"user_email": email})
    if survey and survey.get("survey_data"):
        result = await upsert_chunks(db, patient_id, "survey", "survey", chunk_survey(survey["survey_data"]))
        counts["survey"] += result["inserted"]

    async for log in db.tracker_logs.find({"user_email": email}):
        result = await upsert_chunks(
            db, patient_id, "tracker", log["date"], chunk_tracker(log), timestamp=tracker_timestamp(log)
        )
        counts["tracker"] += result["inserted"]

    async for report in db.reports.find({"user_email": email}):
        report_id = str(report["_id"])
        result = await upsert_chunks(
            db, patient_id, "report", report_id, chunk_report(report_id, report.get("extracted_text", ""))
        )
        counts["report"] += result["inserted"]

    story = await db.stories.find_one({"user_email": email})
    if story and story.get("analysis") and story.get("story_text"):
        result = await upsert_chunks(
            db, patient_id, "narrative", "story", chunk_story(story["story_text"], story.get("analyzed_at"))
        )
        counts["narrative"] += result["inserted"]

    return counts


async def main() -> None:
    await connect_db()
    db = get_db()

    totals = {"users": 0, "survey": 0, "tracker": 0, "report": 0, "narrative": 0}
    async for user in db.users.find({}, {"_id": 1, "email": 1}):
        counts = await backfill_user(db, user)
        totals["users"] += 1
        for key in ("survey", "tracker", "report", "narrative"):
            totals[key] += counts[key]

    retry = await retry_needs_embedding(db)

    total_chunks = await db.evidence_chunks.count_documents({})
    needs_embedding = await db.evidence_chunks.count_documents({"needs_embedding": True})

    print(f"Users processed: {totals['users']}")
    print(
        "New chunks inserted -- "
        f"survey={totals['survey']} tracker={totals['tracker']} "
        f"report={totals['report']} narrative={totals['narrative']}"
    )
    print(f"needs_embedding retry: retried={retry['retried']} embedded={retry['embedded']}")
    print(f"evidence_chunks total={total_chunks} needs_embedding={needs_embedding}")

    sample = await db.evidence_chunks.find_one({"embedding": {"$ne": None}})
    if sample:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "evidence_vector_idx",
                    "path": "embedding",
                    "queryVector": sample["embedding"],
                    "numCandidates": 50,
                    "limit": 5,
                    "filter": {"patient_id": sample["patient_id"]},
                }
            },
            {"$count": "hits"},
        ]
        try:
            result = await db.evidence_chunks.aggregate(pipeline).to_list(length=1)
            hits = result[0]["hits"] if result else 0
            print(f"$vectorSearch check: hits={hits}")
        except Exception as exc:
            print(f"$vectorSearch check failed: {type(exc).__name__}")
    else:
        print("$vectorSearch check skipped: no embedded chunks exist yet.")

    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
