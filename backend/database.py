import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from dotenv import load_dotenv
import certifi

load_dotenv()


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


MONGODB_URI = require_env("MONGODB_URI")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "echocare")

_client: AsyncIOMotorClient = None
_db = None


async def ensure_indexes():
    """Create required indexes. Idempotent -- safe to call on every startup."""
    await _ensure_unique_user_email()
    await _db.insights.create_index([("patient_id", 1), ("theme", 1)], unique=True)
    # Partial: legacy survey docs from an older backend have no user_email.
    await _db.surveys.create_index(
        "user_email", unique=True, partialFilterExpression={"user_email": {"$exists": True}}
    )
    await _db.doctor_feedback.create_index("user_email")
    await _db.evidence_chunks.create_index(
        [("patient_id", 1), ("source_type", 1), ("source_ref", 1), ("text_hash", 1)],
        unique=True,
    )
    await _db.diagnostic_guard.create_index("patient_id", unique=True)


async def _ensure_unique_user_email():
    """Ensure users.email carries a unique index.

    users.email is unique so the find_one/insert_one race in register() can't
    let two accounts land on the same email. An existing non-unique email
    index is replaced only after confirming duplicate values do not exist.
    """
    users = _db.users
    indexes = await users.index_information()
    email_indexes = [
        (name, index)
        for name, index in indexes.items()
        if index.get("key") == [("email", 1)]
    ]

    if any(
        index.get("unique")
        and not index.get("sparse")
        and "partialFilterExpression" not in index
        for _, index in email_indexes
    ):
        return

    duplicates = await users.aggregate(
        [
            {"$group": {"_id": "$email", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
            {"$limit": 1},
        ]
    ).to_list(length=1)
    if duplicates:
        raise RuntimeError(
            "Cannot create a unique index on users.email because duplicate "
            "email values exist. Resolve them manually; startup did not "
            "modify or delete any user documents."
        )

    for name, _ in email_indexes:
        await users.drop_index(name)

    try:
        await users.create_index("email", unique=True)
    except DuplicateKeyError as e:
        raise RuntimeError(
            "Cannot create a unique index on users.email because duplicate "
            "email values appeared during index creation. Resolve them "
            "manually; startup did not modify or delete any user documents."
        ) from e


async def connect_db():
    global _client, _db
    _client = AsyncIOMotorClient(MONGODB_URI, tlsCAFile=certifi.where())
    _db = _client[MONGODB_DB_NAME]
    # Verify connection
    await _client.admin.command("ping")
    await ensure_indexes()
    print(f"[OK] Connected to MongoDB Atlas -- database: {MONGODB_DB_NAME}")


async def close_db():
    global _client
    if _client:
        _client.close()
        print("MongoDB connection closed")


def get_db():
    return _db
