"""Embeddings for evidence chunks (Task 13/14, LE-RAG step 1).

Uses the same Google API key resolution as services/llm.py (GOOGLE_API_KEY
or GEMINI_API_KEY) -- reused here, not duplicated. Model + dimensionality
per plan Sec 10: gemini-embedding-001, 768 dims (matches the Atlas Vector
Search index in scripts/create_vector_index.py).
"""
from typing import Literal

from google import genai
from google.genai import types as genai_types

from services.llm import _google_key

EMBED_DIM = 768
_MODEL = "gemini-embedding-001"
_BATCH_SIZE = 100

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


class EmbeddingUnavailable(Exception):
    """Raised when there is no API key or the API call fails."""


async def embed(texts: list[str], task_type: TaskType = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Embed a list of texts, batching at most 100 per request.

    Raises EmbeddingUnavailable on missing key or any API error -- callers
    (evidence.py) must catch this and store chunks with embedding=None,
    needs_embedding=True instead of failing the caller's save.
    """
    if not texts:
        return []

    key = _google_key()
    if not key:
        raise EmbeddingUnavailable("no GOOGLE_API_KEY/GEMINI_API_KEY configured")

    client = genai.Client(api_key=key)
    config = genai_types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=EMBED_DIM,
    )

    vectors: list[list[float]] = []
    try:
        for start in range(0, len(texts), _BATCH_SIZE):
            batch = texts[start : start + _BATCH_SIZE]
            response = await client.aio.models.embed_content(
                model=_MODEL,
                contents=batch,
                config=config,
            )
            vectors.extend(e.values for e in response.embeddings)
    except Exception as exc:
        raise EmbeddingUnavailable(str(exc)) from exc

    return vectors


async def embed_query(text: str) -> list[float]:
    """Embed a single search query (task_type=RETRIEVAL_QUERY) for the next
    task's $vectorSearch. Raises EmbeddingUnavailable same as embed()."""
    vectors = await embed([text], task_type="RETRIEVAL_QUERY")
    return vectors[0]
