"""Coarse symptom themes for evidence-chunk tagging (Task 13, LE-RAG step 1).

Keyword tagging (tag_text) covers free text (story sentences, survey
answers, report passages). Numeric tagging (tag_tracker_log) covers the
tracker's structured fields per plan resolutions.
"""
import re
from typing import TypedDict


class ThemeDef(TypedDict):
    keywords: list[str]
    query_text: str


THEMES: dict[str, ThemeDef] = {
    "fatigue": {
        "keywords": ["fatigue", "tired", "exhaust", "no energy", "low energy", "worn out", "lethargic"],
        "query_text": "fatigue, tiredness, low energy, exhaustion",
    },
    "sleep": {
        "keywords": ["sleep", "insomnia", "can't sleep", "cant sleep", "waking up", "restless night", "sleepless"],
        "query_text": "sleep quality, insomnia, sleep duration",
    },
    "joint_pain": {
        "keywords": ["joint pain", "joints", "arthritis", "knee pain", "wrist pain", "swollen joint", "stiff joints"],
        "query_text": "joint pain, joint stiffness, arthritis",
    },
    "muscle_pain": {
        "keywords": ["muscle pain", "muscle ache", "muscle weakness", "myalgia", "sore muscles", "cramp"],
        "query_text": "muscle pain, muscle weakness, cramps",
    },
    "headache": {
        "keywords": ["headache", "migraine", "head pain", "throbbing head"],
        "query_text": "headache, migraine",
    },
    "cognitive": {
        "keywords": ["brain fog", "memory", "forgetful", "concentrat", "confus", "can't focus", "cant focus"],
        "query_text": "brain fog, memory problems, difficulty concentrating",
    },
    "dizziness": {
        "keywords": ["dizzy", "dizziness", "vertigo", "lightheaded", "light-headed", "faint"],
        "query_text": "dizziness, vertigo, lightheadedness",
    },
    "digestive": {
        "keywords": ["nausea", "vomit", "diarrhea", "constipat", "bloat", "stomach", "abdominal pain", "digestive", "indigestion"],
        "query_text": "nausea, digestive issues, stomach pain, bloating",
    },
    "cardio": {
        "keywords": ["chest pain", "palpitation", "heart racing", "irregular heartbeat", "chest tightness"],
        "query_text": "chest pain, heart palpitations",
    },
    "respiratory": {
        "keywords": ["shortness of breath", "breathless", "wheeze", "cough", "can't breathe", "cant breathe", "tight chest breathing"],
        "query_text": "shortness of breath, breathing difficulty, cough",
    },
    "skin": {
        "keywords": ["rash", "itch", "hives", "skin", "eczema", "dermatitis"],
        "query_text": "skin rash, itching, hives",
    },
    "mood_anxiety": {
        "keywords": ["anxious", "anxiety", "stress", "depress", "mood", "panic", "overwhelmed", "irritable"],
        "query_text": "anxiety, stress, low mood, depression",
    },
    "menstrual_hormonal": {
        "keywords": ["period", "menstrual", "cramps", "pms", "hormonal", "hot flash", "menopause"],
        "query_text": "menstrual symptoms, hormonal changes",
    },
    "fever_infection": {
        "keywords": ["fever", "chills", "infection", "sore throat", "temperature", "flu-like"],
        "query_text": "fever, chills, infection symptoms",
    },
}

_COMPILED: dict[str, list[re.Pattern]] = {
    theme: [re.compile(re.escape(kw), re.IGNORECASE) for kw in d["keywords"]]
    for theme, d in THEMES.items()
}

# UI tracker symptom checkboxes (src/app/tracker/page.tsx) -> theme.
SYMPTOM_THEME_MAP: dict[str, str] = {
    "Fatigue": "fatigue",
    "Joint Pain": "joint_pain",
    "Headache": "headache",
    "Brain Fog": "cognitive",
    "Nausea": "digestive",
    "Dizziness": "dizziness",
    "Chest Pain": "cardio",
    "Shortness of Breath": "respiratory",
    "Muscle Weakness": "muscle_pain",
    "Digestive Issues": "digestive",
}


def tag_text(text: str) -> list[str]:
    """Return the themes whose keywords appear in text, in THEMES order."""
    if not text:
        return []
    tags = []
    for theme, patterns in _COMPILED.items():
        if any(p.search(text) for p in patterns):
            tags.append(theme)
    return tags


def tag_tracker_log(log: dict) -> list[str]:
    """Numeric + symptom-checkbox tagging for a tracker day (plan Sec 13
    resolutions): energy<=3 -> fatigue, pain>=6 -> joint_pain (if symptoms
    mention joints) else muscle_pain, sleep_hours<6 -> sleep,
    stress>=7 -> mood_anxiety, plus each ticked symptom's own theme.
    """
    tags: set[str] = set()
    symptoms = log.get("symptoms") or []
    symptoms_text = " ".join(symptoms).lower()

    energy = log.get("energy")
    if energy is not None and energy <= 3:
        tags.add("fatigue")

    pain = log.get("pain")
    if pain is not None and pain >= 6:
        tags.add("joint_pain" if "joint" in symptoms_text else "muscle_pain")

    sleep_hours = log.get("sleep_hours")
    if sleep_hours is not None and sleep_hours < 6:
        tags.add("sleep")

    stress = log.get("stress")
    if stress is not None and stress >= 7:
        tags.add("mood_anxiety")

    for symptom in symptoms:
        theme = SYMPTOM_THEME_MAP.get(symptom)
        if theme:
            tags.add(theme)

    # Also keyword-tag free-text notes.
    tags.update(tag_text(log.get("notes") or ""))

    return sorted(tags)
