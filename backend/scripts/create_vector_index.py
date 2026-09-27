"""Create (idempotently) the Atlas Vector Search index on evidence_chunks.

Run: cd backend && uv run python scripts/create_vector_index.py

Atlas M0 (free tier) allows only a few search indexes total, so this script
checks for an existing index of the same name before creating one, and
polls until it reports READY (or PENDING/BUILDING if that takes a while --
Atlas can take a couple of minutes on M0).
"""
import sys
import time

import certifi
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel

sys.path.insert(0, __file__.rsplit("/scripts/", 1)[0])
from database import MONGODB_DB_NAME, MONGODB_URI  # noqa: E402

INDEX_NAME = "evidence_vector_idx"
POLL_SECONDS = 5
POLL_TIMEOUT = 120

DEFINITION = {
    "fields": [
        {"type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine"},
        {"type": "filter", "path": "patient_id"},
        {"type": "filter", "path": "theme_tags"},
        {"type": "filter", "path": "source_type"},
    ]
}


def main() -> str:
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    collection = client[MONGODB_DB_NAME].evidence_chunks

    existing = list(collection.list_search_indexes(INDEX_NAME))
    if not existing:
        collection.create_search_index(
            SearchIndexModel(definition=DEFINITION, name=INDEX_NAME, type="vectorSearch")
        )
        print(f"Requested creation of '{INDEX_NAME}'.")
    else:
        print(f"Index '{INDEX_NAME}' already exists, status={existing[0].get('status')}.")

    deadline = time.monotonic() + POLL_TIMEOUT
    status = "UNKNOWN"
    while time.monotonic() < deadline:
        indexes = list(collection.list_search_indexes(INDEX_NAME))
        if not indexes:
            time.sleep(POLL_SECONDS)
            continue
        status = indexes[0].get("status", "UNKNOWN")
        queryable = indexes[0].get("queryable", False)
        print(f"status={status} queryable={queryable}")
        if status == "READY":
            break
        time.sleep(POLL_SECONDS)

    client.close()
    return status


if __name__ == "__main__":
    final_status = main()
    print(f"Final status: {final_status}")
