"""Server-side safety net: emergency detection + non-diagnostic guard.

Runs before/around the AI pipeline (brief Sec 9). Pure stdlib regex — no
network, no LLM. Merges the keyword lists that used to live only in
src/app/api/chat/route.ts (distress list) and
src/app/api/analyze-story/route.ts (calculateUrgency) so nothing they
caught is lost.
"""
import re
from typing import TypedDict


class Resource(TypedDict):
    label: str
    number_or_url: str


class EmergencyResult(TypedDict):
    category: str
    message: str
    resources: list[Resource]


# ponytail: verify numbers before release — India-only constants, no locale switch.
EMERGENCY_RESOURCES: list[Resource] = [
    {"label": "National Emergency", "number_or_url": "112"},
    {"label": "Ambulance", "number_or_url": "108"},
    {"label": "Tele-MANAS (mental health)", "number_or_url": "14416"},
]

_NEGATION_WINDOW = r"(?:no|not|without|denies|denied|never)\W+(?:\w+\W+){0,3}"

# Ordered: first category to match wins. Each pattern is checked for a
# negation cue within a few words before the match; if found, skipped.
_CATEGORIES: list[tuple[str, str, list[str]]] = [
    (
        "suicidal_self_harm",
        "It sounds like you may be in serious distress.",
        [
            r"\bsuicid\w*\b",
            r"\bself[\s-]?harm\b",
            r"\bhurt(?:ing)?\s+myself\b",
            r"\bend\s+my\s+life\b",
            r"\bwant\s+to\s+die\b",
            r"\bkill(?:ing)?\s+myself\b",
            r"\bcan'?t\s+go\s+on\b",
            r"\bno\s+reason\s+to\s+live\b",
        ],
    ),
    (
        "cardiac",
        "Your symptoms may indicate a cardiac emergency.",
        [
            r"\bchest\s+pain\b.{0,40}\b(radiat\w*|breathless|sweat\w*|arm|jaw)\b",
            r"\b(radiat\w*|breathless|sweat\w*)\b.{0,40}\bchest\s+pain\b",
            r"\bchest\s+pressure\b",
            r"\bcrushing\s+chest\b",
        ],
    ),
    (
        "stroke",
        "Your symptoms may indicate a stroke.",
        [
            r"\bface\b.{0,20}\bdroop\w*\b",
            r"\bdroop\w*\b.{0,20}\bface\b",
            r"\bone[\s-]sided\s+weakness\b",
            r"\bweakness\s+on\s+one\s+side\b",
            r"\bslurred\s+speech\b",
            r"\bsudden\s+numbness\b",
            r"\bstroke\b",
        ],
    ),
    (
        "severe_breathing",
        "Your symptoms may indicate a severe breathing emergency.",
        [
            r"\bsevere\s+breath\w*\b",
            r"\bcan'?t\s+breathe\b",
            r"\bcannot\s+breathe\b",
            r"\bgasping\s+for\s+air\b",
            r"\bturning\s+blue\b",
        ],
    ),
    (
        "anaphylaxis",
        "Your symptoms may indicate a severe allergic reaction (anaphylaxis).",
        [
            r"\banaphyla\w*\b",
            r"\bthroat\s+(closing|swelling)\b",
            r"\bsevere\s+allergic\s+reaction\b",
            r"\bface\s+swelling\b.{0,40}\b(breath|hive)\w*\b",
        ],
    ),
    (
        "overdose_poisoning",
        "This may be an overdose or poisoning emergency.",
        [
            r"\boverdose\w*\b",
            r"\bpoison\w*\b",
            r"\btook\s+too\s+many\s+(pills|tablets)\b",
            r"\bswallowed\s+(chemical|bleach|poison)\w*\b",
        ],
    ),
    (
        "severe_bleeding",
        "Your symptoms may indicate severe bleeding.",
        [
            r"\bsevere\s+bleed\w*\b",
            r"\bbleeding\s+(heavily|won'?t\s+stop|profusely)\b",
            r"\bblood\s+won'?t\s+stop\b",
        ],
    ),
    (
        "loss_of_consciousness",
        "Your symptoms may indicate loss of consciousness or fainting.",
        [
            r"\bfaint(?:ed|ing)?\b",
            r"\bpassed\s+out\b",
            r"\bloss\s+of\s+consciousness\b",
            r"\bunresponsive\b",
            r"\bunconscious\b",
        ],
    ),
]


def _negated(text: str, match: re.Match) -> bool:
    """Check for a negation cue ('no', 'not', 'without', 'denies', 'never')
    within a few words immediately before the match start."""
    window_start = max(0, match.start() - 40)
    window = text[window_start:match.start()]
    return bool(re.search(_NEGATION_WINDOW + r"$", window, re.IGNORECASE))


def check_emergency(text: str) -> EmergencyResult | None:
    """Scan free text for emergency-warning phrasing. Returns the first
    matching category (suicidal_self_harm checked first), or None.
    Simple negation handling: "no chest pain" does not trigger cardiac.
    """
    if not text:
        return None

    for category, message, patterns in _CATEGORIES:
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                if _negated(text, match):
                    continue
                return {
                    "category": category,
                    "message": message,
                    "resources": EMERGENCY_RESOURCES,
                }
    return None


# ponytail: conservative on purpose — this trades some recall (won't catch
# every diagnostic phrasing, e.g. subtler paraphrases) for low false-positive
# rate on benign lines like "you have been tracking your symptoms well".
# Upgrade path if the ceiling bites: run the flagged span back through the
# LLM as a classifier instead of pure regex.
_DIAGNOSTIC_PATTERNS = [
    r"\byou have (?:a|an)?\s*[a-z][a-z\s]{2,40}?(?:disease|disorder|syndrome|condition|infection|deficiency|cancer)\b",
    r"\byou are suffering from\b",
    r"\bdiagnosed with\b",
    r"\bthis is (?:definitely|clearly|certainly)\s+[a-z][a-z\s]{2,40}",
    r"\byou should take \d",
    r"\byour diagnosis is\b",
]


def non_diagnostic_guard(text: str) -> str | None:
    """Detect diagnostic-sounding phrasing in AI-generated text (the model
    stating a diagnosis or prescribing a dose instead of describing a
    pattern). Returns the offending phrase, or None if clean.

    Callers: retry generation once with a stricter instruction on a hit;
    a second failure means drop that insight rather than show it (brief Sec 9).
    """
    if not text:
        return None
    for pattern in _DIAGNOSTIC_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return None


def _demo() -> None:
    emergency_cases = [
        ("no chest pain today", None),
        ("I have chest pain radiating to my arm", "cardiac"),
        ("I want to end my life", "suicidal_self_harm"),
        ("my face is drooping on one side and speech is slurred", "stroke"),
        ("I denied any suicidal thoughts", None),
        ("severe breathing trouble, can't breathe", "severe_breathing"),
        ("she fainted and passed out", "loss_of_consciousness"),
        ("just feeling a bit tired today", None),
    ]
    for text, expected in emergency_cases:
        result = check_emergency(text)
        got = result["category"] if result else None
        assert got == expected, f"check_emergency({text!r}) -> {got}, expected {expected}"

    guard_cases = [
        ("you have been tracking your symptoms well", None),
        ("you have a thyroid disorder", "diagnostic"),
        ("you are suffering from anxiety", "diagnostic"),
        ("this is clearly diabetes", "diagnostic"),
        ("you should take 500 mg twice daily", "diagnostic"),
        ("consider discussing this with a rheumatologist", None),
    ]
    for text, expected in guard_cases:
        got = non_diagnostic_guard(text)
        if expected is None:
            assert got is None, f"non_diagnostic_guard({text!r}) -> {got!r}, expected None"
        else:
            assert got is not None, f"non_diagnostic_guard({text!r}) -> None, expected a match"
    print("safety._demo: all assertions passed")


if __name__ == "__main__":
    _demo()
