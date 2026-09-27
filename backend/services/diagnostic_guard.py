"""Diagnostic Guard (SPSCD) pure functions (Task 19): symptom-gap detection
and contradiction candidate-pairing. DB-facing orchestration lives in
routers/diagnostic_guard.py; everything here takes plain chunk/opinion
dicts in and returns plain dicts out, so it's easy to reason about and
self-check (see _demo below) without a database.
"""
import math
from datetime import datetime, timedelta
from typing import Any, TypedDict

WINDOWS = 3          # T: number of weekly windows checked
WINDOW_DAYS = 7
COSINE_THRESHOLD = 0.75


class Gap(TypedDict):
    theme: str
    weeks_present: int
    first_seen: str
    last_seen: str
    addressed_by: list


def find_gaps(chunks: list[dict], now: datetime) -> list[Gap]:
    """A theme is an unresolved gap if it occurs in every one of the last
    WINDOWS weekly windows AND no report-type chunk (uploaded lab report or
    doctor opinion -- both stored with source_type="report") carries that
    theme tag. Chunk timestamps outside the window range don't count toward
    presence, but a report chunk addresses a theme regardless of when it
    was filed.
    """
    start = now - timedelta(days=WINDOWS * WINDOW_DAYS)
    windows_by_theme: dict[str, set[int]] = {}
    first_seen: dict[str, datetime] = {}
    last_seen: dict[str, datetime] = {}
    addressed: set[str] = set()

    for chunk in chunks:
        themes = chunk.get("theme_tags") or []
        if chunk.get("source_type") == "report":
            addressed.update(themes)

        ts = chunk.get("timestamp")
        if not isinstance(ts, datetime) or ts < start or ts > now:
            continue
        idx = min(WINDOWS - 1, (ts - start).days // WINDOW_DAYS)
        for theme in themes:
            windows_by_theme.setdefault(theme, set()).add(idx)
            if theme not in first_seen or ts < first_seen[theme]:
                first_seen[theme] = ts
            if theme not in last_seen or ts > last_seen[theme]:
                last_seen[theme] = ts

    gaps: list[Gap] = []
    for theme, windows in windows_by_theme.items():
        if len(windows) >= WINDOWS and theme not in addressed:
            gaps.append({
                "theme": theme,
                "weeks_present": len(windows),
                "first_seen": first_seen[theme].isoformat(),
                "last_seen": last_seen[theme].isoformat(),
                "addressed_by": [],
            })
    gaps.sort(key=lambda g: g["last_seen"], reverse=True)
    return gaps


def cosine_similarity(a: list[float] | None, b: list[float] | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class OpinionFeatures(TypedDict):
    id: str
    themes: set
    embedding: list | None


def candidate_pairs(opinions: list[OpinionFeatures]) -> list[tuple[str, str]]:
    """Pairs of opinion ids worth an LLM contradiction check: sharing a theme
    tag, or with embedding cosine >= COSINE_THRESHOLD (opinion chunks may
    have no embedding when the Gemini key is blank -- then only the shared-
    theme rule applies)."""
    pairs: list[tuple[str, str]] = []
    for i in range(len(opinions)):
        for j in range(i + 1, len(opinions)):
            a, b = opinions[i], opinions[j]
            shares_theme = bool(a["themes"] & b["themes"])
            similar = cosine_similarity(a.get("embedding"), b.get("embedding")) >= COSINE_THRESHOLD
            if shares_theme or similar:
                pairs.append(tuple(sorted((a["id"], b["id"]))))
    return pairs


def tracker_averages(logs: list[dict]) -> dict[str, Any]:
    """30-day rolling averages for the advocacy brief. `logs` is whatever
    subset of tracker_logs the caller already filtered by date."""
    fields = ["energy", "pain", "stress", "sleep_hours", "water_glasses"]
    out: dict[str, Any] = {"days_logged": len(logs)}
    for field in fields:
        values = [log[field] for log in logs if log.get(field) is not None]
        out[field] = round(sum(values) / len(values), 1) if values else None
    return out


def _demo() -> None:
    now = datetime(2026, 9, 27)

    def days_ago(n: int) -> datetime:
        return now - timedelta(days=n)

    # Present in all 3 weekly windows, unaddressed -> a gap.
    chunks = [
        {"theme_tags": ["fatigue"], "timestamp": days_ago(1), "source_type": "tracker"},
        {"theme_tags": ["fatigue"], "timestamp": days_ago(9), "source_type": "tracker"},
        {"theme_tags": ["fatigue"], "timestamp": days_ago(17), "source_type": "tracker"},
        # Present in only 2 of 3 windows -> not a gap.
        {"theme_tags": ["headache"], "timestamp": days_ago(1), "source_type": "tracker"},
        {"theme_tags": ["headache"], "timestamp": days_ago(9), "source_type": "tracker"},
        # Present in all 3 windows but addressed by a report -> not a gap.
        {"theme_tags": ["joint_pain"], "timestamp": days_ago(1), "source_type": "tracker"},
        {"theme_tags": ["joint_pain"], "timestamp": days_ago(9), "source_type": "tracker"},
        {"theme_tags": ["joint_pain"], "timestamp": days_ago(17), "source_type": "tracker"},
        {"theme_tags": ["joint_pain"], "timestamp": days_ago(30), "source_type": "report"},
    ]
    gaps = find_gaps(chunks, now)
    themes = {g["theme"] for g in gaps}
    assert themes == {"fatigue"}, themes

    opinions: list[OpinionFeatures] = [
        {"id": "a", "themes": {"fatigue"}, "embedding": [1.0, 0.0]},
        {"id": "b", "themes": {"fatigue"}, "embedding": [0.0, 1.0]},
        {"id": "c", "themes": set(), "embedding": [1.0, 0.0]},
    ]
    pairs = set(candidate_pairs(opinions))
    assert ("a", "b") in pairs, pairs           # shared theme
    assert ("a", "c") in pairs, pairs           # cosine == 1.0
    assert ("b", "c") not in pairs, pairs       # no shared theme, cosine == 0

    avgs = tracker_averages([{"energy": 4, "pain": None}, {"energy": 6, "pain": 8}])
    assert avgs["energy"] == 5.0 and avgs["pain"] == 8.0 and avgs["days_logged"] == 2, avgs

    print("diagnostic_guard._demo: all assertions passed")


if __name__ == "__main__":
    _demo()
