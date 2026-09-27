"""LLM provider router (brief Sec 3.4 / 9): tries providers in a fixed
order per task, skips providers whose env vars are missing, and raises
LLMUnavailable if every provider in the chain fails. One attempt per
provider, no in-provider retries.

Provider request shapes:
- JarvisLabs: mirrors src/app/api/analyze-story/route.ts:283-307 exactly
  (Ollama-style {model, prompt, system, stream: false} -> {response: str}).
- Gemini: google-genai SDK, JSON mode via response_mime_type (+
  response_schema when a json_schema is given).
- Groq: groq SDK, JSON mode via response_format={"type": "json_object"}.
"""
import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncIterator, Literal, TypedDict

import httpx
from google import genai
from google.genai import types as genai_types
from groq import AsyncGroq

logger = logging.getLogger("echocare.llm")

Task = Literal["insight", "story", "chat", "integrative", "classify", "wellness", "extract"]

# Plan Sec 3.4 routing table.
_ROUTES: dict[str, list[str]] = {
    "insight": ["jarvis", "gemini"],
    "story": ["jarvis", "gemini"],
    "integrative": ["gemini"],
    "wellness": ["gemini"],
    "extract": ["gemini"],
    "chat": ["groq", "gemini"],
    "classify": ["groq", "gemini"],
}

_TIMEOUTS = {"jarvis": 20.0, "gemini": 15.0, "groq": 8.0}
_GEMINI_MODEL = "gemini-2.5-flash"
_GROQ_MODEL = "llama-3.3-70b-versatile"


class LLMUnavailable(Exception):
    """Raised when every provider in the task's route failed."""


class LLMResult(TypedDict):
    text: str
    parsed: dict | None
    provider: str
    latency_ms: int


def _google_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


def _jarvis_url() -> str | None:
    return os.getenv("JARVISLABS_LLM_URL")


def _provider_available(provider: str) -> bool:
    if provider == "jarvis":
        return bool(_jarvis_url())
    if provider == "gemini":
        return bool(_google_key())
    if provider == "groq":
        return bool(os.getenv("GROQ_API_KEY"))
    return False


def _extract_json(raw: str) -> dict:
    """Strip ```json fences and grab the outermost {...} block, matching
    cleanJsonText() in analyze-story/route.ts."""
    text = raw.replace("```json", "").replace("```", "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _validate_keys(parsed: dict, json_schema: dict) -> bool:
    """Best-effort check that top-level schema keys are present."""
    props = json_schema.get("properties")
    if not isinstance(props, dict):
        return True
    return all(key in parsed for key in props)


def _flatten_messages(system: str, messages: list[dict]) -> str:
    """Jarvis takes one prompt string; fold multi-turn messages into it."""
    if len(messages) == 1:
        return messages[0].get("content", "")
    return "\n\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages)


def _gemini_contents(messages: list[dict]) -> list[dict]:
    return [
        {
            "role": "model" if m.get("role") in ("assistant", "model") else "user",
            "parts": [{"text": m.get("content", "")}],
        }
        for m in messages
    ]


def _groq_messages(system: str, messages: list[dict]) -> list[dict]:
    return [{"role": "system", "content": system}] + [
        {"role": "assistant" if m.get("role") in ("assistant", "model") else "user", "content": m.get("content", "")}
        for m in messages
    ]


async def _call_jarvis(system: str, messages: list[dict], json_schema: dict | None) -> tuple[str, dict | None]:
    url = _jarvis_url()
    model = os.getenv("JARVISLABS_MODEL", "healthcompanion:latest")
    payload = {
        "model": model,
        "prompt": _flatten_messages(system, messages),
        "system": system,
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUTS["jarvis"]) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    raw = data.get("response") if isinstance(data.get("response"), str) else json.dumps(data)
    parsed = None
    if json_schema is not None:
        parsed = _extract_json(raw)
        if not _validate_keys(parsed, json_schema):
            raise ValueError("jarvis response missing required keys")
    return raw, parsed


async def _call_gemini(system: str, messages: list[dict], json_schema: dict | None, max_tokens: int) -> tuple[str, dict | None]:
    client = genai.Client(api_key=_google_key())
    config_kwargs: dict[str, Any] = {
        "system_instruction": system,
        "max_output_tokens": max_tokens,
    }
    if json_schema is not None:
        config_kwargs["response_mime_type"] = "application/json"
        # response_schema needs the exact google-genai Schema dialect; our
        # callers pass a loose JSON-schema-ish dict, so skip pass-through and
        # rely on mime type + the post-hoc key check in _validate_keys.
    config = genai_types.GenerateContentConfig(**config_kwargs)
    response = await client.aio.models.generate_content(
        model=_GEMINI_MODEL,
        contents=_gemini_contents(messages),
        config=config,
    )
    raw = response.text or ""
    parsed = None
    if json_schema is not None:
        parsed = _extract_json(raw)
        if not _validate_keys(parsed, json_schema):
            raise ValueError("gemini response missing required keys")
    return raw, parsed


async def _call_groq(system: str, messages: list[dict], json_schema: dict | None, max_tokens: int) -> tuple[str, dict | None]:
    client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), timeout=_TIMEOUTS["groq"])
    if json_schema is not None:
        # Groq's json_object mode requires the word "json" somewhere in the
        # conversation, per its (OpenAI-compatible) API contract.
        system = f"{system}\nRespond with a single valid JSON object only."
    kwargs: dict[str, Any] = {
        "model": _GROQ_MODEL,
        "messages": _groq_messages(system, messages),
        "max_tokens": max_tokens,
    }
    if json_schema is not None:
        kwargs["response_format"] = {"type": "json_object"}
    completion = await client.chat.completions.create(**kwargs)
    raw = completion.choices[0].message.content or ""
    parsed = None
    if json_schema is not None:
        parsed = _extract_json(raw)
        if not _validate_keys(parsed, json_schema):
            raise ValueError("groq response missing required keys")
    return raw, parsed


_CALLERS = {
    "jarvis": lambda system, messages, json_schema, max_tokens: _call_jarvis(system, messages, json_schema),
    "gemini": _call_gemini,
    "groq": _call_groq,
}


async def generate(
    task: Task,
    system: str,
    messages: list[dict],
    *,
    json_schema: dict | None = None,
    max_tokens: int = 800,
) -> LLMResult:
    route = _ROUTES.get(task)
    if not route:
        raise ValueError(f"unknown task: {task}")

    for provider in route:
        if not _provider_available(provider):
            continue
        start = time.monotonic()
        try:
            text, parsed = await asyncio.wait_for(
                _CALLERS[provider](system, messages, json_schema, max_tokens),
                timeout=_TIMEOUTS[provider],
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.info("task=%s provider=%s latency_ms=%d ok=True", task, provider, latency_ms)
            return {"text": text, "parsed": parsed, "provider": provider, "latency_ms": latency_ms}
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.warning(
                "task=%s provider=%s latency_ms=%d ok=False error=%s",
                task, provider, latency_ms, type(exc).__name__,
            )
            continue

    raise LLMUnavailable(f"all providers failed for task={task}")


async def stream_chat(system: str, messages: list[dict]) -> AsyncIterator[str]:
    """Streaming variant for chat/classify tasks (Groq -> Gemini), used by
    Task 26. Yields text chunks as they arrive; falls through to the next
    provider on failure (nothing yielded yet), else raises LLMUnavailable."""
    for provider in _ROUTES["chat"]:
        if not _provider_available(provider):
            continue
        try:
            if provider == "groq":
                client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"), timeout=_TIMEOUTS["groq"])
                stream = await client.chat.completions.create(
                    model=_GROQ_MODEL,
                    messages=_groq_messages(system, messages),
                    stream=True,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
                return
            if provider == "gemini":
                client = genai.Client(api_key=_google_key())
                stream = await client.aio.models.generate_content_stream(
                    model=_GEMINI_MODEL,
                    contents=_gemini_contents(messages),
                    config=genai_types.GenerateContentConfig(system_instruction=system),
                )
                async for chunk in stream:
                    if chunk.text:
                        yield chunk.text
                return
        except Exception as exc:
            logger.warning("task=chat provider=%s stream ok=False error=%s", provider, type(exc).__name__)
            continue

    raise LLMUnavailable("all providers failed for task=chat (stream)")
