# EchoCare — Implementation Plan (Gap Analysis → Delivery)

**Baseline:** commit `b97e13d` on `main`, audited and run on 2026-09-27
**Source of requirements:** `EchoCare_Master_Build_Prompt.md` (the "master brief")
**Structure:** 4 phases, 53 numbered tasks. Every task has *Why → Files → Steps → Acceptance → Verify*.

| Phase | Theme | Tasks | Rough size |
|---|---|---|---|
| **0** | Critical fixes — security holes and features that are silently broken | 1–10 | ~2–3 days |
| **1** | Core features — the brief's headline contributions that don't exist yet | 11–25 | ~3–4 weeks |
| **2** | Enhance existing — make every "partially working" module real | 26–42 | ~2–3 weeks |
| **3** | Bonus — academic polish and stretch goals | 43–53 | as time allows |

Sizes: **S** ≤ ½ day · **M** 1–2 days · **L** 3–5 days.

---

## Contents

1. [Where the project stands today](#1-where-the-project-stands-today)
2. [Global constraints (apply to every task)](#2-global-constraints-apply-to-every-task)
3. [Target architecture](#3-target-architecture)
4. [Phase 0 — Critical fixes](#phase-0--critical-fixes)
5. [Phase 1 — Core features](#phase-1--core-features)
6. [Phase 2 — Enhance existing modules](#phase-2--enhance-existing-modules)
7. [Phase 3 — Bonus](#phase-3--bonus)
8. [Module → task traceability](#8-module--task-traceability)
9. [Code to delete](#9-code-to-delete)
10. [Decisions and assumptions](#10-decisions-and-assumptions)
11. [Academic deliverables checklist](#11-academic-deliverables-checklist)

---

## 1. Where the project stands today

### 1.1 One-paragraph summary

The UI is broad and polished (19 pages, consistent teal design system), but the platform's core technical claims — retrieval-augmented insights, evidence chunks, vector search, a trained model, real facility discovery, Groq, Tavily — **do not exist in code**. Several modules the brief describes as "already working" are **broken at runtime**: tracker saves always return 401, and survey / story-analysis / doctor-feedback persistence call backend endpoints that don't exist (404), while the UI reports success. There is also a **Google-login authentication bypass**. AI logic currently lives in unauthenticated Next.js API routes and uses whole-context prompt-stuffing, with heuristic/mock fallbacks that the brief explicitly forbids.

### 1.2 Verified at runtime (2026-09-27, both servers running against Atlas)

| Flow | Result | Root cause |
|---|---|---|
| Register / login | ✅ works — but accepted a 1-character password | no validation (`backend/routers/auth.py:14-17`) |
| Tracker save via backend directly | ✅ 200 | — |
| **Tracker via UI path** (`/api/tracker` Next proxy) | ❌ **401 always** | proxy runs server-side, `getStoredToken()` reads `localStorage` → `null` (`src/lib/auth.ts:14`, `src/app/api/tracker/route.ts`) |
| **Survey autosave** `/api/survey` | ❌ **404** — UI still shows "autosaved" | endpoint missing; `fetch` doesn't throw on 404 (`src/app/survey/page.tsx:106-124`) |
| **Story analysis persistence** `/api/story/analyze` | ❌ **404** | endpoint missing (`src/app/api/analyze-story/route.ts:624`) |
| **Doctor feedback** `/api/doctor-feedback` | ❌ **404** | endpoint missing + proxy sends no token |
| **Report download** `/api/story/report/{id}/download` | ❌ missing | endpoint missing; file bytes never stored |
| Health insights | returns template text, **no LLM**; claims "found in DB" for request-body data | `src/app/api/health-insights/route.ts` |
| **Google login with forged token** (fake signature) | ❌ **200 + valid 7-day session** | unverified-claims fallback (`backend/auth_utils.py:74-82`) |

### 1.3 Module scorecard vs. the master brief

| # | Module | Brief says | Actual state |
|---|---|---|---|
| 1 | Auth & Onboarding | "solid — harden rate-limiting" | ⚠️ auth bypass, hardcoded `SECRET_KEY` default, no validation, no rate limit, no unique email index |
| 2 | Story Analyzer | rewire through LE-RAG | ⚠️ drafts persist; analysis = prompt-stuffing to JarvisLabs + 300 lines of regex fallback; analysis never persisted (404) |
| 3 | Initial Survey | never silently fall back to localStorage | ❌ backend endpoint missing → localStorage-only, UI lies about saving |
| 4 | Daily Tracker | "already MongoDB-backed" | ❌ 401 on every UI save; proxy fabricates values (`brain_fog: 7` if symptom ticked, `pain \|\| 3`) |
| 5 | Report Analysis | Cloudinary + OCR + field extraction | ⚠️ PDF upload + PyMuPDF work; no Cloudinary (UI claims it), no OCR, no fields, no out-of-range, no download |
| 6 | LE-RAG Insights | rebuild with real retrieval | ❌ absent; rule-based templates; `confidence = base + count*5` |
| 7 | AI Companion Chat | Groq + RAG grounding | ⚠️ Gemini, prompt-stuffed with client-sent context, unauthenticated, not persisted; distress keywords ✅ |
| 8 | Diagnostic Guard | MongoDB collection + router | ⚠️ rich UI, all state in 4 localStorage keys, hardcoded `CASE-REF: 32DD-F3FC-A069` |
| 9 | Department Recommendation | trained classifier | ❌ page reads localStorage only; no model |
| 10 | Facility Finder (NHFRA) | Places + Haversine + Directions | ❌ fully mocked (`getMockDoctors()`); no map, no geolocation |
| 11 | Wellness & Self-Care | Tavily-grounded with citations | ⚠️ static content only |
| 12 | Doctor Feedback | persist, feed weighting | ❌ backend endpoint missing |
| 13 | Notifications | real scheduled reminders | ❌ hardcoded 7-item array; buttons inert |
| 14 | Dashboard | off localStorage | ⚠️ fake default metrics ("4,245 steps") until overwritten |
| 15 | Settings & Privacy | real export/delete | ⚠️ everything localStorage; "delete account" = `localStorage.clear()`; export ignores MongoDB |
| 16 | Reports & PDF Export | combined summary | ⚠️ `reports/print` reads a key nothing writes, falls back to a hardcoded fake patient story |

### 1.4 Cross-cutting findings

- **AI lives in the wrong layer.** 7 Next.js API routes (`src/app/api/*`) call Gemini/JarvisLabs with **no authentication and no rate limiting**. The brief places AI in FastAPI (`services/le_rag.py`). Moving it fixes auth for free (`Depends(get_current_user)`) and gives AI code direct DB access for retrieval.
- **None of these exist anywhere:** `evidence_chunks`, embeddings, Atlas Vector Search, Groq, Tavily, Google Maps, Cloudinary, OCR, rate limiting, data export/delete endpoints, diagnostic_guard / facilities / notifications routers.
- **Safety escalation** exists twice with different keyword lists (chat distress, story urgency), both in Next routes. Needs one server-side implementation.
- **No shared `<EvidenceCard>`** — each page re-implements disclaimer/confidence/evidence markup.
- **`next-themes` installed but unused**; theme is hand-rolled via `classList`.
- **Mobile:** 19+ fixed `gridTemplateColumns: "repeat(N, 1fr)"` layouts, only 4 media queries.
- **Secrets hygiene:** `backend/debug_mongo.py` prints `MONGODB_URI` (with credentials); committed.
- **Config drift:** `render.yaml` pins Python 3.10.13 and `backend/pyproject.toml` says `requires-python = ">=3.10"` (brief: 3.11+; pinned pydantic 2.7 does not build on 3.14). The backend was moved to **uv** (`pyproject.toml` + `uv.lock`, `uv sync` on Render) after the audit — all dependency steps below use `uv add`; code uses `GEMINI_API_KEY`, brief uses `GOOGLE_API_KEY`; CORS `"https://*.vercel.app"` in `allow_origins` is inert.

---

## 2. Global constraints (apply to every task)

Every implementer and reviewer treats these as binding.

1. **Non-diagnostic.** No AI output may state or imply a diagnosis. Every generated text passes `services/safety.py::non_diagnostic_guard()` before returning. UI renders AI output only through `<EvidenceCard>` (disclaimer + confidence + evidence).
2. **Evidence gate is never bypassed.** An insight requires a theme with **≥ 3 occurrences** and **≥ 2 distinct `source_type` values**. No demo flag, env var, or code path skips it.
3. **MongoDB is the source of truth.** `localStorage` may only cache data that has a backend sync-back path. The UI never says "saved" unless the backend returned 2xx.
4. **No fabricated data in production paths.** Seed/demo data carries `is_demo: true` and is visibly labelled "DEMO DATA" in the UI. Mock doctors, fake metrics, fake notifications, and fake case IDs are deleted.
5. **Every AI call has a fallback chain; the terminal state is honest.** Provider down → next provider → HTTP `503 {"state": "unavailable", "message": ...}`. Never template/regex output pretending to be AI output. Never stale mock data.
6. **All patient endpoints require JWT** via `Depends(get_current_user)`. All AI-calling endpoints are rate-limited per user.
7. **Safety check first.** Free-text input (story, chat) runs through `check_emergency()` before any AI call; a hit short-circuits to emergency resources.
8. **Privacy.** Never log patient narrative text, chunk text, prompts, or LLM responses. Log IDs, counts, latencies, and error types only.
9. **AI logic lives in FastAPI.** Next.js is UI only; by the end of Phase 2, `src/app/api/` and `src/lib/gemini.ts` are deleted.
10. **Next.js 16 is not the Next.js in training data.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing Next code; heed deprecations.
11. **Pinned stack** (brief §3). No substitutions without asking. Deviations already forced by providers are listed in §10.
12. **Python 3.11** everywhere (local venv, Render, Docker).
13. **Tests:** every non-trivial pure function (gate, confidence, ranking, Haversine, safety, theme tagging, out-of-range) gets a `pytest` test in `backend/tests/`. No mocking frameworks or fixture suites beyond what's needed.
14. **Identity keys:** existing collections keep `user_email`. New collections use `patient_id` = `users._id` (ObjectId), per the brief's schema. `services/account.py::USER_COLLECTIONS` maps every collection → its owner field, and export/delete use that single map.

---

## 3. Target architecture

### 3.1 Backend layout (end of Phase 2)

```
backend/
  main.py                 # app, CORS, routers, limiter, startup index creation
  database.py             # Motor client + ensure_indexes()
  auth_utils.py
  limiter.py              # slowapi Limiter (key = user id from JWT, else IP)
  routers/
    auth.py  story.py  tracker.py  survey.py  feedback.py
    insights.py           # LE-RAG endpoints
    chat.py               # Groq SSE chat
    diagnostic_guard.py
    departments.py        # classifier-backed recommendation
    facilities.py         # Places + ranking + routes + appointment requests
    reports.py            # upload / OCR / fields / download / delete
    wellness.py           # Tavily-grounded tips
    integrative.py
    notifications.py
    account.py            # profile, settings, export, delete
    dashboard.py          # aggregate summary + consultation summary
    voice.py              # translate-voice (moved from Next)
  services/
    llm.py                # provider router: JarvisLabs → Gemini → Groq by task
    embeddings.py
    themes.py             # rule-based theme tagging
    evidence.py           # chunking + upsert into evidence_chunks
    le_rag.py             # gate → $vectorSearch → grounded prompt → confidence
    safety.py             # check_emergency(), non_diagnostic_guard()
    diagnostic_guard.py   # gap + contradiction detection
    department_model.py   # ONNX classifier inference
    facilities.py         # Places/Routes clients + NHFRA ranking
    ocr.py  report_fields.py  storage.py (Cloudinary)
    tavily.py  notifications.py  account.py  health_score.py
  scripts/
    create_vector_index.py  backfill_chunks.py  seed_demo_patient.py  smoke.py
  tests/
ml/department_classifier/   # dataset prep, training, evaluation, model card
```

### 3.2 MongoDB collections

| Collection | Owner field | Key fields | Indexes |
|---|---|---|---|
| `users` | — | email, hashed_password, full_name, auth_provider, profile{}, settings{}, notification_state{} | **unique** `email` |
| `stories` | user_email | story_text, analysis{}, analyzed_at | `user_email` unique |
| `surveys` *(new)* | user_email | survey_data{}, updated_at | `user_email` unique |
| `tracker_logs` | user_email | date, mood, symptoms[], sleep_hours, water_glasses, stress, energy, pain, notes | `(user_email, date)` unique |
| `reports` | user_email | filename, cloudinary_public_id, cloudinary_url, mime, extracted_text, extraction_method, fields[] | `(user_email, uploaded_at)` |
| `doctor_feedback` *(new)* | user_email | doctor_name, system, department, rating, helpfulness, communication, follow_up, satisfaction, review | `user_email` |
| `evidence_chunks` *(new)* | patient_id | source_type, source_ref, text, text_hash, embedding[], theme_tags[], timestamp, metadata{} | `(patient_id, source_type, source_ref, text_hash)` unique; **Atlas vector index** |
| `insights` *(new)* | patient_id | theme, title, observation, discussion_points[], confidence, low_confidence, chunk_ids[], evidence_summary, provider, generated_at | `(patient_id, theme)` unique |
| `diagnostic_guard` *(new)* | patient_id | doctor_opinions[], requested_markers[], escalated, contradictions[], updated_at | `patient_id` unique |
| `chat_messages` *(new)* | patient_id | role, content, chunk_ids[], created_at | `(patient_id, created_at)` |
| `appointment_requests` *(new)* | patient_id | place_id, facility_name, department, preferred_date, notes, status | `patient_id` |
| `wellness_cache` *(new)* | — | topic, tips[{text, source_url, source_title}], fetched_at | `topic` unique, TTL 7 days |

### 3.3 Environment variables

**Backend** (`backend/.env`, Render):
```
MONGODB_URI=  MONGODB_DB_NAME=  SECRET_KEY=  FRONTEND_URL=
GOOGLE_CLIENT_ID=  GOOGLE_API_KEY=  GOOGLE_MAPS_API_KEY=
GROQ_API_KEY=  TAVILY_API_KEY=
JARVISLABS_LLM_URL=  JARVISLABS_MODEL=healthcompanion:latest
CLOUDINARY_URL=
DEPT_MODEL_PATH=ml/department_classifier/artifacts/model.int8.onnx
```
**Frontend** (`.env.local`, Render): `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` (Maps Embed API, HTTP-referrer-restricted).

`GEMINI_API_KEY` is retired in favour of `GOOGLE_API_KEY`. The backend refuses to start if `SECRET_KEY`, `MONGODB_URI` or `GOOGLE_CLIENT_ID` are missing; optional provider keys missing → that provider is skipped and its features return 503 "not configured".

### 3.4 LLM routing table

| Task | Provider order | Why |
|---|---|---|
| Insight generation, story extraction | JarvisLabs `healthcompanion` → Gemini 2.5 Flash | domain-tuned primary |
| Integrative-care suggestions, wellness summarisation, report field extraction | Gemini 2.5 Flash | brief assigns it |
| Chat | Groq (Llama 3.3 70B) → Gemini | first token < 1.5 s |
| Contradiction check, reranking, stance classification | Groq → Gemini | cheap and fast |
| Everything above, all providers down | `503 unavailable` | constraint 5 |

---

## Phase 0 — Critical fixes

**Goal:** no security holes; every existing screen actually saves to MongoDB; failures are visible. Nothing new is built here.
**Exit criteria:** `backend/scripts/smoke.py` (Task 10) passes end-to-end; a forged Google token is rejected.

### Task 1: Remove the Google-login bypass and fail fast on missing secrets
**Size:** S · **Module:** 1

**Why:** `verify_google_token()` falls back to `jwt.get_unverified_claims()` when signature verification fails (`backend/auth_utils.py:74-82`). Verified: a token with a fake signature produced a valid session. `SECRET_KEY` and `GOOGLE_CLIENT_ID` have hardcoded defaults (`auth_utils.py:9`, `:53`), so a deploy with a missing env var signs JWTs with a public key string.

**Files:** `backend/auth_utils.py`, `backend/main.py`

**Steps:**
1. Delete the `except` fallback branch; on any verification failure return `None`.
2. Additionally require `payload["email_verified"] is True`.
3. Cache Google certs for their `Cache-Control: max-age` (module-level dict + expiry timestamp), so a transient network error isn't the common path.
4. Remove the defaults for `SECRET_KEY` and `GOOGLE_CLIENT_ID`; read with `os.environ[...]` at startup inside `lifespan` and raise a clear `RuntimeError` naming the missing variable.

**Acceptance:**
- A token with an invalid signature → `400 Invalid Google ID token`.
- A token with `email_verified: false` → 400.
- Starting without `SECRET_KEY` → process exits with a message naming `SECRET_KEY`.

**Verify:** `backend/tests/test_auth_google.py` — build an RS256 token signed with a throwaway key, monkeypatch the certs fetch to return a *different* key set, assert `verify_google_token()` returns `None`.

---

### Task 2: Secrets hygiene and config drift
**Size:** S · **Module:** cross-cutting

**Why:** `backend/debug_mongo.py` prints the Atlas URI with credentials. `passlib` is an unused dependency. CORS wildcard is inert. Python 3.10 pin contradicts the brief and pinned pydantic doesn't build on newer Pythons.

**Files:** `backend/debug_mongo.py` (delete), `backend/pyproject.toml`, `backend/uv.lock`, `backend/main.py`, `render.yaml`, `README.md`

**Steps:**
1. `git rm backend/debug_mongo.py`.
2. `uv remove passlib` (unused — `auth_utils.py` uses `bcrypt` directly, which is already a direct dependency). Set `requires-python = ">=3.11"` in `pyproject.toml` and re-lock (`uv lock`). Remove the `debug_mongo.py` line from the README folder tree.
3. CORS: replace the `"https://*.vercel.app"` entry with `allow_origin_regex=r"https://.*\.vercel\.app"` — or delete it if the frontend deploys only to Render (it does per `render.yaml`). Default: delete it.
4. `render.yaml`: `PYTHON_VERSION: 3.11.9`; rename `GEMINI_API_KEY` → `GOOGLE_API_KEY` in both services; add all new keys from §3.3 as `sync: false`.
5. Add `backend/.python-version` containing `3.11`.
6. Rotate the Atlas password (it may have appeared in logs) — **manual step for the owner**, note it in the PR.

**Acceptance:** `uv sync --frozen` succeeds on Python 3.11; `grep -r MONGODB_URI backend | grep print` is empty.

**Verify:** `cd backend && rm -rf .venv && uv sync --frozen --python 3.11 && uv run uvicorn main:app` starts and `/health` is 200.

---

### Task 3: Auth input hardening and login rate limiting
**Size:** S · **Module:** 1

**Why:** 1-character passwords accepted; email is plain `str`; no unique index (race between `find_one` and `insert_one` in `auth.py:49-60`); no brute-force protection.

**Files:** `backend/routers/auth.py`, `backend/database.py`, `backend/limiter.py` (new), `backend/main.py`, `backend/pyproject.toml` (`uv add slowapi email-validator`)

**Steps:**
1. `RegisterRequest.email: EmailStr`; `password: str = Field(min_length=8, max_length=128)`; `full_name: str = Field(min_length=1, max_length=100)`.
2. Lower-case and strip emails on register, login and Google paths.
3. `database.py`: add `ensure_indexes()` called from `connect_db()`; first index: `users.email` unique. (Later tasks append their indexes here.)
4. Catch `DuplicateKeyError` on insert → `409 Email already registered`.
5. `limiter.py`: `Limiter(key_func=user_or_ip)` where `user_or_ip` decodes the JWT `sub` if present, else client IP. Register the exception handler in `main.py`.
6. Limits: `/register` 5/min/IP, `/login` 10/min/IP, `/google` 10/min/IP.
7. `ponytail:` comment on the limiter: in-memory storage, single instance only; switch `storage_uri` to MongoDB/Redis if scaled horizontally.

**Acceptance:** password `"x"` → 422; duplicate email → 409; 11th login within a minute → 429.

**Verify:** `backend/tests/test_auth_validation.py` using FastAPI `TestClient` against a test database (`MONGODB_DB_NAME=echocare_test`).

---

### Task 4: Honest backend client on the frontend
**Size:** S · **Module:** cross-cutting (prerequisite for Tasks 5–8)

**Why:** `fetchFromBackend` returns the raw `Response`; callers treat 404/401 as success (survey shows "autosaved" on a 404). Expired tokens never log the user out.

**Files:** `src/lib/backend.ts`, `src/components/AuthProvider.tsx`

**Steps:**
1. Add `backendJSON<T>(path, options): Promise<T>` next to `fetchFromBackend`: throws `BackendError(status, detail)` on non-2xx; on 401 calls `clearUser()` and redirects to `/login?expired=1`.
2. Keep `fetchFromBackend` for multipart uploads only (it forces `Content-Type: application/json`; make it skip that header when `body instanceof FormData`).
3. Do **not** migrate every caller here — Tasks 5–8 migrate the callers they touch.

**Acceptance:** calling a missing path throws; a 401 lands the user on `/login?expired=1`.

**Verify:** manual — log in, corrupt the token in devtools, reload `/dashboard` → redirected to login.

---

### Task 5: Make the Daily Tracker save for real
**Size:** M · **Module:** 4

**Why:** The UI posts to the Next proxy `src/app/api/tracker/route.ts`, which runs server-side with no token → 401 on every save (verified). The proxy also invents values: `fatigue = 10 - energy`, `brain_fog = 7` if "Brain Fog" ticked, `joint_pain = pain || 3`. The UI collects mood, symptoms[], sleep, water, stress, energy, pain.

**Files:** `backend/routers/tracker.py`, `src/app/api/tracker/route.ts` (delete), `src/app/tracker/page.tsx`, `src/app/dashboard/page.tsx`

**Steps:**
1. Replace `TrackerLog` with the fields the UI actually collects, all validated, **no defaults that invent data**:
   `date: date`, `mood: Literal["great","good","okay","low","bad"]` (match the UI's option values — check `tracker/page.tsx`), `symptoms: list[str] = []` (max 20, each ≤ 40 chars), `sleep_hours: float = Field(ge=0, le=24)`, `water_glasses: int = Field(ge=0, le=30)`, `stress: int = Field(ge=0, le=10)`, `energy: int = Field(ge=0, le=10)`, `pain: int = Field(ge=0, le=10)`, `notes: str = Field("", max_length=2000)`.
2. `GET /api/tracker/history?days=30` (cap 90) returns logs plus `streak` (consecutive days ending today or yesterday with a log). Put `compute_streak(dates, today)` in the router module as a pure function.
3. Legacy documents (with `fatigue`, `joint_pain`, …) are left untouched; readers treat missing new fields as `null`. **No back-fill mapping** — mapping fatigue → energy would fabricate data.
4. Delete `src/app/api/tracker/route.ts`. `tracker/page.tsx` and `dashboard/page.tsx` call `backendJSON("/api/tracker")` / `backendJSON("/api/tracker/history")` directly.
5. Save button shows success only after the backend 200; on error show an inline error with retry.

**Acceptance:** saving from the UI creates/updates one `tracker_logs` document for today with exactly the submitted values; the streak shown matches the DB.

**Verify:** `backend/tests/test_streak.py` (gaps, today-missing-but-yesterday-present, empty). Manual: save in UI, check the Atlas document.

---

### Task 6: Survey persistence
**Size:** S · **Module:** 3

**Why:** `survey/page.tsx:84,110,149` calls `GET/POST /api/survey`; the backend has no such route (404), so data only lives in localStorage while the UI says "autosaved".

**Files:** `backend/routers/survey.py` (new), `backend/main.py`, `backend/database.py` (index), `src/app/survey/page.tsx`

**Steps:**
1. `GET /api/survey` → `{survey_data: {...} | null, updated_at}`.
2. `POST /api/survey` body `{survey_data: dict}` (reject payloads > 50 KB) → upsert `surveys` by `user_email`.
3. Frontend: use `backendJSON`; show "Saved" only on success, "Not saved — retrying" on failure; keep localStorage as a cache written **after** a successful save. On load, backend wins over cache.

**Acceptance:** refresh on a different browser shows the saved survey.

**Verify:** manual cross-browser check + a `TestClient` round-trip test.

---

### Task 7: Story analysis persistence (stop-gap until Task 16)
**Size:** S · **Module:** 2

**Why:** The Next route posts to `/api/story/analyze`, which doesn't exist, so the analysis is never stored. Task 16 replaces the generator; this task only stops data loss now.

**Files:** `backend/routers/story.py`, `src/app/api/analyze-story/route.ts`, `src/app/story/page.tsx`

**Steps:**
1. `PUT /api/story/analysis` body `{analysis: dict}` (≤ 100 KB) → `$set` on the user's `stories` doc with `analyzed_at`.
2. Remove the Next route's call to the nonexistent backend endpoint and the `isBackendFallback` signature hack (`analyze-story/route.ts:326-333, 619-641`).
3. `story/page.tsx`: after receiving an analysis, `backendJSON("/api/story/analysis", {method:"PUT"})`; `GET /api/story/latest` already returns `analysis`.

**Acceptance:** analysis survives a reload on another browser.

**Verify:** manual.

---

### Task 8: Doctor feedback persistence
**Size:** S · **Module:** 12

**Why:** `/api/doctor-feedback` missing on the backend (verified 404); the proxy also sends no token; history lives in localStorage.

**Files:** `backend/routers/feedback.py` (new), `backend/main.py`, `src/app/api/doctor-feedback/route.ts` (delete), `src/app/feedback/page.tsx`, `src/app/dashboard/page.tsx`

**Steps:**
1. `POST /api/doctor-feedback` with the fields the page sends (`doctor_name`, `system`, `rating` 1–10, `helpfulness`, `communication`, `follow_up`, `satisfaction`, `review` ≤ 2000) plus optional `department`, `consultation_date`.
2. `GET /api/doctor-feedback` → latest 50 for the user.
3. Frontend calls the backend directly; history list comes from `GET`, not `echocare-feedback-history`. Remove that key's writes (dashboard reads switch to the endpoint).

**Acceptance:** submitted feedback appears in history after reload and in Atlas.

**Verify:** `TestClient` round-trip test.

---

### Task 9: Report upload hardening and honest download state
**Size:** S · **Module:** 5

**Why:** Only the filename extension is checked (`story.py:79`); the whole file is read into memory with no size cap (`story.py:82`); the UI calls a download endpoint that doesn't exist and claims "Cloudinary-backed" storage that doesn't exist.

**Files:** `backend/routers/story.py`, `src/app/reports/page.tsx`, `src/app/diagnostic-guard/page.tsx`

**Steps:**
1. Read at most 10 MB + 1 byte; > 10 MB → 413.
2. Check magic bytes: PDF must start with `%PDF-`. (Images are added in Task 28.)
3. Remove the "Cloudinary-backed" copy (`diagnostic-guard/page.tsx:819`) and hide the download button until Task 27 ships storage.
4. Stop returning `"[Text extraction failed: …]"` as report text; return `extraction_status: "failed"` and store empty text.

**Acceptance:** a renamed `.txt` → 400; an 11 MB PDF → 413.

**Verify:** `TestClient` tests for both.

---

### Task 10: Phase 0 smoke script
**Size:** S · **Module:** verification

**Why:** Phase 0's exit criterion needs one runnable check against a live backend.

**Files:** `backend/scripts/smoke.py`

**Steps:** A standalone script (uses `httpx`) against `BASE_URL` (default `http://localhost:8000`):
1. Register `smoke-<timestamp>@example.test` with a valid password; log in.
2. POST tracker, GET history (assert streak ≥ 1).
3. POST/GET survey; PUT/GET story analysis; POST/GET feedback.
4. Forged Google token (valid base64, fake signature) → assert 400.
5. Short password → 422.
6. Cleanup: delete everything for that email via Motor (guarded by the `smoke-…@example.test` pattern).
7. Exit non-zero on any failure, printing which step failed.

**Acceptance:** `python backend/scripts/smoke.py` exits 0 against a local stack.

---

## Phase 1 — Core features

**Goal:** the brief's academic contributions exist and are demonstrable: LE-RAG with real retrieval, evidence-cited insights, Diagnostic Guard in MongoDB, a trained and evaluated department classifier, and real facility discovery.
**Exit criteria:** with the demo patient (Task 18) the insights page shows ≥ 2 gated, cited, confidence-scored insights generated from `$vectorSearch` results; a patient with too little evidence sees "not enough evidence yet", not an insight; the classifier metrics table exists; facility search returns real Places results ranked by NHFRA.

### Task 11: LLM provider router in FastAPI
**Size:** M · **Modules:** 2, 6, 7, 11

**Why:** Brief §3/§9: three providers with distinct jobs and a fallback chain whose terminal state is an honest "unavailable".

**Files:** `backend/services/llm.py` (new), `backend/pyproject.toml` (`uv add httpx google-genai groq`)

**Steps:**
1. `class LLMUnavailable(Exception)`.
2. `async def generate(task: Literal["insight","story","chat","integrative","classify","wellness","extract"], system: str, messages: list[dict], *, json_schema: dict | None = None, max_tokens: int = 800) -> LLMResult` where `LLMResult = {text, parsed, provider, latency_ms}`.
3. Provider order per §3.4. Skip providers whose env vars are missing. Per-provider timeout: Jarvis 20 s, Gemini 15 s, Groq 8 s. One attempt per provider, no retries within a provider.
4. JarvisLabs: OpenAI-compatible or Ollama-style? **Check the current `analyze-story/route.ts:283-307` call shape and reuse it exactly.**
5. When `json_schema` is given: request JSON mode where the provider supports it, parse, validate keys; parse failure counts as a provider failure → next provider.
6. `async def stream_chat(...)` for Groq/Gemini streaming (used in Task 26).
7. Log `task, provider, latency_ms, ok` only — never prompt or output text.
8. All providers failed → raise `LLMUnavailable`. Routers convert it to `503 {"state":"unavailable","message":"AI insights are temporarily unavailable. Your data is saved."}` via one exception handler in `main.py`.

**Acceptance:** with only `GOOGLE_API_KEY` set, `generate("insight", …)` succeeds via Gemini; with no keys it raises `LLMUnavailable`.

**Verify:** `backend/tests/test_llm_router.py` — monkeypatch provider callables to fail/succeed, assert order and the terminal exception.

---

### Task 12: Server-side safety service
**Size:** S · **Modules:** 2, 7 (NFR safety)

**Why:** Brief §9 requires emergency escalation before the AI pipeline. Today two different keyword lists live in Next routes (`chat/route.ts:58-90`, `analyze-story/route.ts:561`).

**Files:** `backend/services/safety.py` (new), `backend/tests/test_safety.py`

**Steps:**
1. `check_emergency(text) -> EmergencyResult | None` with categories: `cardiac` (chest pain/pressure + radiating/breathless/sweating), `stroke` (face droop, one-sided weakness, slurred speech), `suicidal_self_harm`, `severe_breathing`, `anaphylaxis`, `overdose_poisoning`, `severe_bleeding`, `loss_of_consciousness`. Merge both existing keyword lists; use word-boundary regexes and simple negation handling ("no chest pain" must not trigger).
2. `EmergencyResult = {category, message, resources: [{label, number_or_url}]}`. Resources constant for India (the app's locale — `en-IN` dates, Tamil voice input): **112** (national emergency), **108** (ambulance), **Tele-MANAS 14416** (mental health). *Verify numbers before release.*
3. `non_diagnostic_guard(text) -> str | None`: detect diagnostic phrasing (`you have`, `you are suffering from`, `diagnosed with`, `this is (definitely|clearly) <condition>`, `you should take <dose>`). Returns the offending phrase or `None`. Callers retry generation once with a stricter instruction; a second failure → drop that insight (never show it).

**Acceptance / Verify:** `test_safety.py` covers each category, negations, and ≥ 5 diagnostic/non-diagnostic phrasing pairs.

---

### Task 13: Evidence chunking, theme tagging and embedding on write
**Size:** L · **Module:** 6 (LE-RAG step 1)

**Why:** Brief §5 step 1. Nothing is chunked or embedded today.

**Files:** `backend/services/themes.py`, `backend/services/embeddings.py`, `backend/services/evidence.py` (all new); hooks in `routers/story.py`, `routers/survey.py`, `routers/tracker.py`, `routers/story.py::upload_report`

**Steps:**
1. **Themes (`themes.py`)** — `THEMES: dict[str, ThemeDef]` with ~14 coarse themes: `fatigue`, `sleep`, `joint_pain`, `muscle_pain`, `headache`, `cognitive` (brain fog, memory), `dizziness`, `digestive`, `cardio`, `respiratory`, `skin`, `mood_anxiety`, `menstrual_hormonal`, `fever_infection`. Each has keywords/regexes and a `query_text` description used for retrieval. `tag_text(text) -> list[str]`. Tracker logs also tag numerically: `energy ≤ 3 → fatigue`, `pain ≥ 6 → joint_pain` only if symptoms mention joints else `muscle_pain`, `sleep_hours < 6 → sleep`, `stress ≥ 7 → mood_anxiety`, plus each ticked symptom mapped to its theme.
2. **Embeddings (`embeddings.py`)** — `async embed(texts: list[str]) -> list[list[float]]` via Google embeddings, batching up to 100. Dimension constant `EMBED_DIM = 768`. See §10 on the model name.
3. **Chunking (`evidence.py`)**:
   - *Story*: split into sentences, group into ~300–600-character passages without splitting sentences. `source_ref = story`. Timestamp = analysis time.
   - *Survey*: one chunk per answered field, rendered `"<question label>: <answer>"`. `metadata.survey_field`.
   - *Tracker*: one chunk per day, rendered as a sentence: `"On 2026-09-20: energy 3/10, pain 6/10, stress 7/10, slept 5.5h, 4 glasses of water, mood low. Symptoms: fatigue, brain fog. Note: …"`. `source_ref = date`.
   - *Report*: one chunk per extracted field (Task 29) plus ~600-character passages of the text. `metadata.report_id`.
4. `async upsert_chunks(patient_id, source_type, source_ref, texts)`: compute `text_hash` (sha256); skip embedding for hashes that already exist; delete chunks for that `(patient_id, source_type, source_ref)` whose hash is no longer present; insert new ones with `theme_tags`, `timestamp`, `embedding`.
5. **When to chunk:** survey — on save (debounced client-side already); tracker — on save; report — on upload; story — **only on explicit Analyze (Task 16)**, not on draft autosave (it fires on every pause in typing).
6. Embedding failure must not fail the user's save: store the chunk with `embedding: null` and `needs_embedding: true`; `backfill_chunks.py` (Task 14) retries.
7. Tests: `test_themes.py` (keyword + numeric tagging), `test_chunking.py` (sentence grouping never splits mid-sentence; tracker sentence format; hash dedupe).

**Acceptance:** saving a tracker day creates exactly one chunk for that date; re-saving unchanged data re-embeds nothing.

**Verify:** tests + inspect `evidence_chunks` in Atlas after a UI save.

---

### Task 14: Atlas Vector Search index and back-fill
**Size:** S · **Module:** 6

**Files:** `backend/scripts/create_vector_index.py`, `backend/scripts/backfill_chunks.py`, `README.md` (setup section)

**Steps:**
1. `create_vector_index.py` creates (idempotently) the index `evidence_vector_idx` on `evidence_chunks` via `create_search_index` with `type="vectorSearch"`:
   ```json
   {"fields": [
     {"type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine"},
     {"type": "filter", "path": "patient_id"},
     {"type": "filter", "path": "theme_tags"},
     {"type": "filter", "path": "source_type"}
   ]}
   ```
   Poll until status is `READY`. Note: the Atlas M0 free tier allows a small number of search indexes; this uses one.
2. `backfill_chunks.py`: for every user, chunk existing survey, tracker logs, reports and analysed stories; embed any `needs_embedding: true` chunks. Idempotent (hash dedupe).

**Acceptance:** `$vectorSearch` with a patient filter returns that patient's chunks only.

**Verify:** a check at the end of the script runs one `$vectorSearch` and prints the hit count.

---

### Task 15: LE-RAG service and insight endpoints
**Size:** L · **Module:** 6 — **the core contribution**

**Why:** Brief §5 steps 2–6. `src/app/api/health-insights/route.ts` has no LLM and no retrieval.

**Files:** `backend/services/le_rag.py`, `backend/routers/insights.py` (new), `backend/tests/test_le_rag.py`

**Steps:**
1. **Cluster + gate.** Aggregate the patient's chunks: `$unwind theme_tags`, group by theme → `count`, `source_types` set, `first_ts`, `last_ts`. **Gate:** keep themes with `count ≥ 3` and `len(source_types) ≥ 2` (constants `MIN_OCCURRENCES = 3`, `MIN_SOURCE_TYPES = 2`). Rank by count; cap at 5 themes per run (latency budget).
2. **Retrieve.** For each gated theme: embed `THEMES[theme].query_text` (cache these embeddings in-process), run
   ```
   $vectorSearch {index: "evidence_vector_idx", path: "embedding", queryVector,
                  numCandidates: 100, limit: 6,
                  filter: {patient_id, theme_tags: theme}}
   ```
   and project `score: {$meta: "vectorSearchScore"}`.
3. **Grounded prompt.** System prompt: advisory-only instruction ("You help a patient prepare for a conversation with a licensed clinician. You never diagnose. Only use the evidence provided. Every statement must be traceable to a numbered evidence item."). User content: the 6 chunks, numbered `[E1]…[E6]` with source type and date — **nothing else from the patient's history**. Required JSON output: `{title, observation, discussion_points: [str], questions_for_clinician: [str], cited: ["E1", …]}`.
4. **Guard.** Run `non_diagnostic_guard` on every string field; retry once with a stricter instruction; still failing → drop the insight. Drop citations that don't refer to supplied items; if none remain, drop the insight.
5. **Confidence** (constants in one place, reported in the academic write-up):
   `confidence = 0.35·avg_similarity + 0.25·source_diversity + 0.20·occurrence_rate + 0.20·temporal_consistency`
   - `avg_similarity` = mean `vectorSearchScore` of the cited chunks (Atlas cosine scores are already in [0, 1]).
   - `source_diversity` = distinct `source_type` among retrieved chunks ÷ 4.
   - `occurrence_rate` = min(1, days with the theme in the last 30 days ÷ days with *any* data in the last 30 days).
   - `temporal_consistency` = weeks containing ≥ 1 occurrence ÷ weeks spanned from first to last occurrence (min span 1 week).
   - `low_confidence = confidence < τ`, `τ = 0.55`. Low-confidence insights are still returned and flagged.
6. **Citations out.** Return `chunk_ids` plus `evidence_summary`: counts by source type and date range, e.g. `{"tracker": 2, "report": 1, "narrative": 1, "from": "2026-10-03", "to": "2026-10-17"}`, and short excerpts (≤ 160 chars) per cited chunk.
7. **Cache.** Upsert into `insights` keyed `(patient_id, theme)` with `generated_at` and `provider`. Delete insights for themes that no longer pass the gate.
8. **Endpoints** (`routers/insights.py`, rate-limited 10/min and 60/day per user):
   - `GET /api/health-insights` → cached insights + `stale: bool` (any chunk newer than `generated_at`) + `gated_out: [{theme, count, source_types, needed}]` so the UI can say "Fatigue: 2 of 3 occurrences, 1 of 2 source types".
   - `POST /api/health-insights/refresh` → runs the pipeline; themes processed concurrently with `asyncio.gather`.
9. **Tests** (`test_le_rag.py`): gate boundary cases (2 vs 3 occurrences, 1 vs 2 source types), confidence formula with hand-computed values, citation-filtering drops unknown `E#` ids.

**Acceptance:** a patient with 3 tracker entries but no other source gets **zero** insights and a `gated_out` explanation; the demo patient gets cited insights; p95 refresh < 5 s for 5 themes (measure in Task 44).

**Verify:** tests + run against the demo patient (Task 18).

---

### Task 16: Story analysis in FastAPI through the evidence pipeline
**Size:** M · **Module:** 2

**Why:** The brief says to replace prompt-stuffing entirely. The current Next route (648 lines) includes ~300 lines of regex "analysis" used when the LLM fails — forbidden by constraint 5.

**Files:** `backend/routers/story.py`, `src/app/api/analyze-story/route.ts` (delete), `src/app/story/page.tsx`

**Steps:**
1. `POST /api/story/analyze` (rate-limited 5/min, 30/day):
   1. `check_emergency(story_text)` → hit returns `200 {"escalation": EmergencyResult}` and nothing else runs.
   2. Save the story text, chunk and embed it (Task 13).
   3. **Extraction** (structuring, not insight — allowed on a single source): `llm.generate("story", …)` with JSON schema `{symptoms: [{name, onset, severity: "mild|moderate|severe|unclear", quote}], timeline: [{when, event, quote}], emotional_themes: [str], pain_points: [str], open_questions: [str]}`. Every item must carry a verbatim `quote`; drop items whose quote isn't a substring of the story.
   4. Persist into `stories.analysis`; trigger `POST /refresh` logic in the background (`BackgroundTasks`) so insights update.
2. Keep the current story UI (brief: "keep frontend"); map the new fields onto the existing editable cards. The old `urgencyLevel` comes from the safety check now.
3. `LLMUnavailable` → the story is still saved; the UI shows "Analysis temporarily unavailable — your story is saved".
4. Delete the Next route and Task 7's stop-gap `PUT /analysis` if no longer used.

**Acceptance:** analyzing a story creates narrative chunks, stores an extraction where every quote exists in the text, and refreshes insights.

**Verify:** a unit test for quote verification; manual end-to-end.

---

### Task 17: `<EvidenceCard>` and `<EmergencyBanner>`; wire insights, story and dashboard
**Size:** M · **Modules:** 6, 14 (UI guidance §8)

**Files:** `src/components/EvidenceCard.tsx`, `src/components/EmergencyBanner.tsx` (new), `src/app/insights/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/story/page.tsx`, `src/app/api/health-insights/route.ts` (delete)

**Steps:**
1. `EvidenceCard` props: `title, body, discussionPoints?, questions?, confidence (0–1), lowConfidence, evidenceSummary, excerpts[], provider?`. Layout, consistently placed:
   - top-right: confidence as a percentage **plus a text label** ("Moderate confidence") and an icon — never colour alone;
   - low confidence: an amber "Low confidence — discuss with caution" pill;
   - footer: "Based on: 2 tracker entries, 1 report, your story (Oct 3–17)" with an expandable excerpt list (Radix Accordion);
   - fixed disclaimer line: "This is a discussion guide for your clinician, not a diagnosis."
2. `EmergencyBanner`: full-width, high-contrast, `role="alert"`, the resources as `tel:` links.
3. `insights/page.tsx`: load `GET /api/health-insights`; "Refresh" → `POST …/refresh` with a loading state; render `gated_out` as "Building evidence" rows with progress toward the gate; 503 → "Insights temporarily unavailable" state (no cached mock).
4. Dashboard: top 3 insights via `EvidenceCard` (compact variant).
5. Remove all localStorage writes on the insights page (`insights/page.tsx:134-212`).

**Acceptance:** every AI insight in the app renders through `EvidenceCard`; `grep -rn "confidence" src/app` shows no bespoke confidence markup outside it.

**Verify:** manual, both themes, at 375 px width.

---

### Task 18: Demo patient seed (clearly labelled)
**Size:** S · **Module:** verification/demo

**Why:** LE-RAG needs multi-source longitudinal data to demonstrate honestly; constraint 4 requires demo data to be labelled.

**Files:** `backend/scripts/seed_demo_patient.py`

**Steps:** Create `demo@echocare.test` (password printed once) with `users.is_demo = true`: a 400-word story (fatigue, joint pain, brain fog over 4 months, two consultations with differing opinions); a completed survey; 30 days of tracker logs with a realistic fatigue/sleep pattern and noise; 2 reports with text including an out-of-range ferritin/vitamin D; 2 doctor opinions (one "normal, likely stress", one "recommend rheumatology panel"). Run chunking + embedding. The UI shows a persistent "DEMO ACCOUNT" badge in the Topbar when `is_demo` is true. `--reset` deletes and recreates.

**Acceptance:** after seeding, `POST /api/health-insights/refresh` produces ≥ 2 insights, and at least one theme is gated out.

---

### Task 19: Diagnostic Guard backend (SPSCD)
**Size:** L · **Module:** 8

**Why:** All Diagnostic Guard state is in localStorage (`echocare-case-escalated`, `echocare-requested-markers`, `echocare-doctor-opinions`, `echocare-diagnostic-reports`); gap and contradiction logic is client-side and heuristic.

**Files:** `backend/routers/diagnostic_guard.py`, `backend/services/diagnostic_guard.py`, `backend/tests/test_diagnostic_guard.py`

**Steps:**
1. Document per patient in `diagnostic_guard`: `doctor_opinions: [{id, doctor, specialty, date, opinion_text, created_at}]`, `requested_markers: [str]`, `escalated: bool`, `escalated_at`, `contradictions: [{a_id, b_id, contradicts, summary, checked_at}]`.
2. Doctor opinions are also evidence: each is chunked as `source_type: "report"` with `metadata.kind = "opinion"` so it participates in retrieval. (The brief's `source_type` enum stays four values.)
3. Endpoints: `GET /api/diagnostic-guard`; `POST /opinions`; `DELETE /opinions/{id}` (also removes its chunks); `PUT /markers`; `POST /escalate` / `DELETE /escalate`; `GET /gaps`; `POST /contradictions/check`; `GET /brief`.
4. **Symptom-gap detection** (`find_gaps`): split the last `T × 7` days into `T = 3` weekly windows; a theme is *unresolved* if it has ≥ 1 occurrence in **every** window **and** no report field or doctor opinion carries that theme tag. Return `{theme, weeks_present, first_seen, last_seen, addressed_by: []}`. Pure function over chunk metadata → easy to test.
5. **Contradiction detection:** candidate pairs = opinions sharing a theme tag **or** with embedding cosine ≥ 0.75. For each new pair, `llm.generate("classify", …)` with JSON `{contradicts: bool, stance_a, stance_b, summary}`. Cache by pair so re-checks are free.
6. **Advocacy brief** (`GET /brief`): structured JSON — unresolved gaps, contradictions, requested markers, top insights (from `insights`), tracker 30-day averages, case reference = last 12 hex chars of the document `_id` (replacing the hardcoded `32DD-F3FC-A069`). Rendering/printing stays client-side.

**Acceptance:** gap detection unit tests (present in 2 of 3 windows → not a gap; addressed by a report → not a gap); two opposing opinions produce a cached contradiction.

---

### Task 20: Diagnostic Guard frontend migration
**Size:** M · **Module:** 8

**Files:** `src/app/diagnostic-guard/page.tsx` (1,524 lines — split out subcomponents only where a section is touched)

**Steps:**
1. Replace every read/write of the four localStorage keys (lines ~570–678) with the Task 19 endpoints.
2. One-time migration: on first load, if localStorage has those keys and the backend document is empty, POST them to the backend, then delete the keys. Show a one-line "Moved your saved notes to your account" toast.
3. Advocacy brief modal reads `GET /brief`; export stays `window.print()` with a print stylesheet (native — no PDF library).
4. Gap and contradiction panels render through `EvidenceCard`-style evidence footers.

**Acceptance:** `grep -n "localStorage" src/app/diagnostic-guard/page.tsx` shows only the one-time migration code.

---

### Task 21: Department classifier — dataset
**Size:** M · **Module:** 9 (brief §7 Option A)

**Files:** `ml/department_classifier/prepare_data.py`, `ml/department_classifier/labels.yaml`, `ml/department_classifier/README.md`, `.gitignore` (`ml/**/data/raw`, `ml/**/artifacts`)

**Steps:**
1. Label set (12): General Medicine, Cardiology, Pulmonology, Gastroenterology, Neurology, Rheumatology, Endocrinology, Dermatology, Psychiatry / Mental Health, ENT, Obstetrics & Gynaecology, Orthopaedics.
2. Sources (check each licence and cite it in the README): Hugging Face `gretelai/symptom_to_diagnosis`; Kaggle "Symptom2Disease". Map each diagnosis → department in `labels.yaml` (reviewed by a person — note who).
3. Synthetic augmentation for thin classes: LLM-paraphrased patient-voice narratives, **train split only**, capped at 50% of any class; flag rows with `synthetic: true`.
4. Split 70/15/15, stratified, `seed = 42`; dedupe near-duplicates across splits (normalised text hash) to prevent leakage. Write `splits.json` with counts per class per split.

**Acceptance:** README table of class counts per split; no test row is a paraphrase of a train row (paraphrases are generated only from train rows).

---

### Task 22: Department classifier — training, evaluation, export
**Size:** L · **Module:** 9

**Files:** `ml/department_classifier/train.py`, `evaluate.py`, `export_onnx.py`, `requirements.txt`, `README.md` (model card + metrics)

**Steps:**
1. **Baseline:** TF-IDF (1–2-grams) + Logistic Regression.
2. **Model:** fine-tune `distilbert-base-uncased` (and optionally `emilyalsentzer/Bio_ClinicalBERT`) — 3–5 epochs, lr 2e-5–5e-5, early stopping on validation macro-F1. Train on Colab/Kaggle GPU or JarvisLabs.
3. **Evaluate on the untouched test split:** accuracy, macro-F1, per-class precision/recall/F1, confusion matrix PNG, and a real-only subset score (excluding synthetic-sourced rows from test — there should be none by construction; report it anyway).
4. **Export:** ONNX + dynamic int8 quantisation (~65 MB). Render's free tier has 512 MB RAM — PyTorch at inference won't fit; `onnxruntime` + `tokenizers` will. Report the quantised model's test macro-F1 too.
5. **Artifact hosting:** a Hugging Face Hub repo or GitHub Release; the backend downloads it at startup to `DEPT_MODEL_PATH` if it is missing.

**Acceptance:** README metrics table `| Model | Accuracy | Macro-F1 |` for baseline, fine-tuned, fine-tuned-int8, plus the confusion matrix.

---

### Task 23: Department recommendation endpoint and page
**Size:** M · **Module:** 9

**Files:** `backend/services/department_model.py`, `backend/routers/departments.py`, `src/app/recommendations/page.tsx`

**Steps:**
1. `department_model.py`: load the ONNX session once; `predict(text) -> [(label, prob)]` sorted.
2. Input text = the patient's **gated** themes' top chunks concatenated (≤ 512 tokens), so recommendations come from corroborated evidence only. No gated themes → `{"state": "insufficient_evidence", "gated_out": [...]}`.
3. `GET /api/departments/recommend` → top 3 `{department, probability, supporting_themes, chunk_ids, evidence_summary}`; phrasing is fixed: "A clinician in **Rheumatology** may be well placed to discuss these patterns" — never "you need".
4. Feedback weighting hook (filled in by Task 36).
5. Page: replace the localStorage-only logic (`recommendations/page.tsx:100-101`) with the endpoint; render through `EvidenceCard`; "Find nearby" button → facility finder with the department preselected.

**Acceptance:** the demo patient's top-3 is shown with probabilities and evidence; a new user sees "insufficient evidence".

**Verify:** `test_department_model.py` — load the model, predict on 3 fixed strings, assert the labels are within the label set and probabilities sum to ≈ 1.

---

### Task 24: Facility finder backend (NHFRA)
**Size:** L · **Module:** 10

**Why:** Entirely mocked today (`src/lib/gemini.ts:487-588`); the brief forbids fabricated facilities.

**Files:** `backend/services/facilities.py`, `backend/routers/facilities.py`, `backend/tests/test_facility_ranking.py`

**Steps:**
1. **Discovery:** Places API (New) Text Search — `POST https://places.googleapis.com/v1/places:searchText` — query `"<department> hospital OR clinic"`, `locationBias.circle` with the patient's lat/lng and radius (default 10 km, max 50 km), field mask `places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.types,places.nationalPhoneNumber,places.googleMapsUri`.
2. **NHFRA ranking** (pure function, constants documented):
   `score = 0.40·distance_score + 0.25·rating_score + 0.25·specialty_match + 0.10·open_now`
   - `distance_score = max(0, 1 − haversine_km / radius_km)`; Haversine implemented in the module (stdlib `math`).
   - `rating_score = (rating / 5) · min(1, log10(1 + userRatingCount) / 3)` — damps 5-star places with 2 reviews.
   - `specialty_match` = 1 if the name/types contain the department's keywords, 0.5 for general hospitals, else 0.
   - `open_now` = 1 / 0 / 0.5 if unknown.
   - Task 36 adds a feedback term.
3. **Routes/ETA:** Routes API `computeRoutes` for the top 5 only (cost control) → `{distance_m, duration_s}`; the rest show straight-line distance.
4. **Endpoints:** `GET /api/facilities/search?lat&lng&department&radius_km` (rate-limited 20/min); `POST /api/facilities/appointment-requests` storing `{place_id, facility_name, department, preferred_date, notes, status: "requested"}`; `GET` lists them.
5. **Honesty:** appointment requests are **logged for the patient, not sent to the facility** (no partner API) — the API response and UI say so and show the facility phone number.
6. No `GOOGLE_MAPS_API_KEY` → `503 {"state":"not_configured"}`. (A labelled demo seed is optional — Task 53.)
7. Caching: none in v1. `ponytail:` note — add a short TTL cache if Places costs matter; Google's terms limit caching Places content beyond `place_id`.

**Acceptance:** real results within the radius, sorted by score, top 5 with ETA; ranking tests on hand-made fixtures (closer beats farther at equal rating; 4.8★ from 3 reviews loses to 4.5★ from 900).

---

### Task 25: Facility finder frontend and removal of mock doctors
**Size:** M · **Module:** 10

**Files:** `src/app/integrative/page.tsx`, `src/app/consultancy/page.tsx`, `src/components/Sidebar.tsx`, `src/lib/gemini.ts`

**Steps:**
1. Facility section (in `integrative/page.tsx` or a new `/facilities` route — default: new `src/app/facilities/page.tsx` and a Sidebar entry): request `navigator.geolocation` with a manual city/pincode fallback (Geocoding via the backend: add `GET /api/facilities/geocode?q=` to Task 24's router).
2. List of ranked results: name, distance, ETA, rating (+ count), open-now badge (text + icon), phone (`tel:`), "Directions" link (`https://www.google.com/maps/dir/?api=1&destination_place_id=…`), "Request appointment" dialog (Radix Dialog).
3. Map: Maps Embed API iframe (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`) showing the selected facility — desktop side panel; on mobile collapsed behind a "Show map" toggle.
4. Delete `getMockDoctors()`, `getMockIntegrativeSuggestions()`, `getMockResponse()` and their call sites (`integrative/page.tsx:71`).
5. Delete the 17-line stub `src/app/consultancy/page.tsx` and its Sidebar entry (or redirect it to `/facilities`).

**Acceptance:** `grep -rn "getMockDoctors\|Dr. Priya" src` is empty; the facility list shows real places.

---

## Phase 2 — Enhance existing modules

**Goal:** every remaining module reads/writes MongoDB, no mock content remains, and all non-functional requirements are met.
**Exit criteria:** `grep -rn "localStorage" src` shows only cache-with-sync-back usages listed in Task 31 plus the theme preference; `src/app/api/` no longer exists; settings export contains every collection; account deletion leaves zero documents.

### Task 26: AI Companion Chat — Groq, RAG grounding, streaming, persistence
**Size:** L · **Module:** 7

**Files:** `backend/routers/chat.py`, `src/app/chat/page.tsx`, `src/app/api/chat/route.ts` (delete)

**Steps:**
1. `POST /api/chat` (rate-limited 30/min, 300/day) body `{message}` (≤ 2000 chars):
   1. `check_emergency` → emit a single `escalation` event and stop.
   2. Embed the message; `$vectorSearch` over the patient's chunks (no theme filter), `limit 6`, keep chunks with score ≥ 0.6.
   3. Last 8 turns from `chat_messages` as history.
   4. System prompt: Echo persona, non-diagnostic, answer only from the supplied evidence plus general wellness knowledge clearly marked as general; if the evidence is empty, say so.
   5. Stream via `StreamingResponse` as SSE (`event: token`, then a final `event: done` with `chunk_ids` and an evidence summary).
   6. Persist the user and assistant messages; run `non_diagnostic_guard` on the completed reply — if it trips, replace the stored and displayed reply with a safe rephrase request and log the event (not the text).
2. `GET /api/chat/history?limit=50`, `DELETE /api/chat/history`.
3. Frontend: read the SSE stream with `fetch` + `ReadableStream` (the Authorization header rules out `EventSource`); show "Based on your: …" under grounded replies; the helpline strip stays always visible (brief module 7).
4. Remove the client-side context assembly from localStorage (`chat/page.tsx:93,165`) — the server already has the evidence.

**Acceptance:** first token < 1.5 s p95 on Groq (measured in Task 44); a chat about "my tiredness" cites tracker/story chunks.

---

### Task 27: Report storage on Cloudinary, download and delete
**Size:** M · **Module:** 5

**Files:** `backend/services/storage.py`, `backend/routers/reports.py` (move report routes out of `story.py`; keep the old paths as aliases until the frontend switches), `src/app/reports/page.tsx`

**Steps:**
1. Upload the original file to Cloudinary (`resource_type="raw"` for PDF, `"image"` for images), folder `echocare/<patient_id>/`, `type="authenticated"` so URLs aren't public.
2. Store `cloudinary_public_id`, `mime`, `bytes` on the report.
3. `GET /api/reports/{id}/download` → verify ownership → 302 to a short-lived signed URL.
4. `DELETE /api/reports/{id}` → delete the Cloudinary asset, the report document, and its evidence chunks.
5. Restore the download button (hidden in Task 9).

**Acceptance:** download works for the owner, 404 for other users; delete removes the asset, the document and its chunks.

---

### Task 28: OCR fallback for scanned and photographed reports
**Size:** M · **Module:** 5

**Files:** `backend/services/ocr.py`, `backend/Dockerfile` (new), `render.yaml`

**Steps:**
1. Accept `image/jpeg`, `image/png` (magic-byte checked) besides PDF.
2. PDF: PyMuPDF text per page; a page with < 50 characters → render at 300 DPI (`page.get_pixmap(dpi=300)`) → `pytesseract.image_to_string`. Images → Tesseract directly. Record `extraction_method: "text" | "ocr" | "mixed"`.
3. Tesseract needs the system binary, which Render's native Python runtime can't install → switch the backend service to Docker: `python:3.11-slim` + `apt-get install -y tesseract-ocr tesseract-ocr-eng` (add `-tam` if Tamil reports matter), then `COPY --from=ghcr.io/astral-sh/uv` and `uv sync --frozen` so the image uses the same lockfile. `uv add pytesseract`. EasyOCR is rejected: it pulls PyTorch, which doesn't fit in 512 MB.
4. Cap OCR at 20 pages; run it in a thread (`asyncio.to_thread`) so the event loop isn't blocked.

**Acceptance:** a phone photo of a lab report yields readable text with `extraction_method: "ocr"`.

**Verify:** `test_ocr.py` on a small fixture image committed under `backend/tests/fixtures/`.

---

### Task 29: Field-level report extraction and out-of-range flags
**Size:** M · **Module:** 5

**Files:** `backend/services/report_fields.py`, `backend/routers/reports.py`, `src/app/reports/page.tsx`

**Steps:**
1. `llm.generate("extract", …)` on the report text with JSON schema `[{test, value, unit, ref_low, ref_high, ref_text}]`; keep only rows whose `test` and `value` appear in the source text (anti-hallucination check).
2. **Out-of-range is computed in code, never by the LLM:** `status = "low" | "high" | "normal" | "unknown"` from numeric `value` vs `ref_low`/`ref_high`.
3. Store `fields[]` on the report; each field becomes an evidence chunk (`"Ferritin 12 ng/mL (ref 30–400) — LOW, 2026-08-14"`) tagged by theme (e.g. ferritin → `fatigue`).
4. UI: a fields table per report; status as a text badge plus icon (not colour alone); a "values outside the lab's reference range are worth asking your clinician about" note — no interpretation.
5. `LLMUnavailable` → the report is saved with `fields_status: "pending"` and a "Retry extraction" button.

**Acceptance / Verify:** `test_report_fields.py` for the range logic (inclusive bounds, missing bounds → unknown, non-numeric values like "<0.5").

---

### Task 30: Integrative care suggestions — honest and evidence-gated
**Size:** M · **Module:** 10/11 (integrative)

**Files:** `backend/routers/integrative.py`, `src/app/integrative/page.tsx`, `src/app/api/integrative/route.ts` (delete), `src/lib/gemini.ts` (delete remaining integrative code)

**Steps:**
1. Input = gated themes only (same gate as LE-RAG). No gated themes → insufficient-evidence state.
2. Gemini generates suggestions (JSON), each linked to a theme and cited chunks; `non_diagnostic_guard`; every suggestion says "discuss with your clinician before starting"; no dosages (the guard's dose regex).
3. Delete `enrichWithMockData`, the hardcoded `communityInsights` numbers, and `buildDynamicIntegrativeSuggestions` (`gemini.ts:112-225, 453-485`).
4. The active-plan and consultation state (`echocare-active-plan`, `echocare-consultations`) move to `users.settings.integrative_plan` via the Task 31 endpoints.

**Acceptance:** no hardcoded percentages or community numbers remain in the UI.

---

### Task 31: Profile and settings in MongoDB; wire `next-themes`
**Size:** M · **Module:** 15

**Files:** `backend/routers/account.py`, `src/app/profile/page.tsx`, `src/app/settings/page.tsx`, `src/app/layout.tsx`, `src/components/Topbar.tsx`

**Steps:**
1. `GET/PUT /api/account/profile` (name, age range, sex, height, weight, conditions, allergies, medications — validated, all optional) → `users.profile`.
2. `GET/PUT /api/account/settings` → `users.settings`: `language`, `timezone` (IANA, needed by Task 33), `notifications {daily_checkin, checkin_time, streak_risk, medication}`, `medications [{name, times: ["08:00"]}]` (for reminders only — never dosing advice), `compact_mode`, `analytics_opt_in`, `data_retention_days`.
3. Remove fake toggles with no backend meaning (2FA, session timeout) unless implemented — **default: remove** and note them as Phase 3. Delete the fake "Connect Devices" `alert()` (`settings/page.tsx:131-133`).
4. Theme: wrap the app in `ThemeProvider` from `next-themes` (`attribute="class"`), replace the hand-rolled `classList` toggling in settings; theme preference may stay client-side (it's a per-device preference, allowed by constraint 3).
5. Allowed localStorage after this task: `echocare-user` (auth token — see Task 47), the `next-themes` key, and read-through caches that are overwritten by backend responses.

**Acceptance:** settings and profile follow the user across browsers; no hydration flash when toggling dark mode.

---

### Task 32: Data export and account deletion (right to erasure)
**Size:** M · **Module:** 15

**Files:** `backend/services/account.py`, `backend/routers/account.py`, `src/app/settings/page.tsx`, `backend/tests/test_account_collections.py`

**Steps:**
1. `USER_COLLECTIONS: dict[str, str]` — collection → owner field (`user_email` or `patient_id`) for **every** collection in §3.2.
2. `GET /api/account/export` → a JSON download containing every document from every collection for the user, excluding `hashed_password` and `embedding` arrays, plus report download links. Rate-limited 3/hour.
3. `DELETE /api/account` body `{confirm: "<user email>", password?}` (password required for password accounts) → delete Cloudinary assets, then every collection's documents, then the user; returns 204. The frontend clears localStorage and redirects to `/login?deleted=1`.
4. Existing JWTs stop working automatically (`get_current_user` finds no user).
5. **Guard test:** `test_account_collections.py` lists the collections in the test DB after running the smoke flow and asserts each is present in `USER_COLLECTIONS` — so a future collection can't silently escape deletion.

**Acceptance:** after deletion, a scan of all collections for that user's email/id returns zero documents.

---

### Task 33: Real notifications
**Size:** M · **Module:** 13

**Files:** `backend/services/notifications.py`, `backend/routers/notifications.py`, `src/app/notifications/page.tsx`, `src/components/Topbar.tsx`

**Steps:**
1. **Computed on read** from MongoDB in the user's timezone — no cron needed for these:
   - `daily_checkin`: no tracker log today and local time ≥ `checkin_time`;
   - `streak_risk`: streak ≥ 2, no log today, local time ≥ 18:00;
   - `medication`: each `medications[].times` entry within the last 2 hours, not dismissed;
   - `insight_ready`: insights newer than the last notification read;
   - `contradiction_found`: new Diagnostic Guard contradiction.
   Each has a deterministic id `"<type>:<date>:<key>"`.
2. `users.notification_state = {read: [ids], dismissed: [ids]}`, pruned to 30 days.
3. Endpoints: `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /read-all`, `POST /{id}/dismiss`.
4. Topbar badge polls every 5 minutes and on window focus.
5. Delete the hardcoded array (`notifications/page.tsx:5-13`); wire every button.
6. This meets the brief's "real reminders … via polling". Push/email reminders need a scheduler → Task 49.

**Acceptance / Verify:** `test_notifications.py` with a frozen clock and timezone covering each rule.

---

### Task 34: Dashboard on real data
**Size:** M · **Module:** 14

**Files:** `backend/routers/dashboard.py`, `backend/services/health_score.py`, `src/app/dashboard/page.tsx`

**Steps:**
1. `GET /api/dashboard` → `{health_score, score_breakdown, streak, tracker_7d_averages, trend_30d, top_insights (3), recent_reports (3), dg_status {gaps, contradictions, escalated}, is_demo}`.
2. **Health score** (documented, not a clinical measure — say so in a tooltip): mean of 7-day components scaled 0–100: `energy/10`, `1 − pain/10`, `1 − stress/10`, sleep closeness to 7–9 h (1 inside, linear falloff to 0 at ±4 h), water (min(1, glasses/8)). `null` if fewer than 3 logs in 7 days → the UI says "Log 3 days to see your score".
3. Delete `defaultSymptomData`, `defaultSleepData`, `defaultMetrics` (incl. "4,245 steps"), `defaultReports`, `defaultInsights` (`dashboard/page.tsx:9-38`) and the `demoMode` flag (`home/page.tsx:64`); add proper empty states.
4. Charts: Recharts line/area for 30-day trends, radial gauge for the score (brief §8).

**Acceptance / Verify:** `test_health_score.py`; a brand-new user sees empty states, not numbers.

---

### Task 35: Consultation-prep summary and printable export
**Size:** S · **Module:** 16

**Files:** `backend/routers/dashboard.py`, `src/app/reports/print/page.tsx`

**Steps:**
1. `GET /api/consultation-summary` → story excerpt + extracted symptom timeline, key survey answers, 30-day tracker averages and trend direction, top insights with evidence summaries, report fields out of range, Diagnostic Guard brief, generation timestamp and disclaimer.
2. `reports/print/page.tsx`: render that; delete the `patientStory` localStorage read and the hardcoded fake story (`print/page.tsx:14`); `@media print` stylesheet; `window.print()`.

**Acceptance:** the printout contains only this patient's real data, with evidence summaries.

---

### Task 36: Feedback feeds recommendation weighting
**Size:** S · **Module:** 12

**Files:** `backend/services/facilities.py`, `backend/routers/departments.py`

**Steps:**
1. Per patient: average normalised rating per `department` and per `place_id` from `doctor_feedback` (add an optional `place_id` to the feedback form when opened from a facility card).
2. NHFRA: add `+ 0.10·feedback_score` (rescale other weights to sum to 1: 0.35/0.20/0.25/0.10/0.10) where `feedback_score` = the patient's own normalised rating for that place, 0.5 if none.
3. Departments: show "You rated your last Rheumatology visit 3/10" as context; **do not** change classifier probabilities (keeps the evaluated model's output honest).

**Acceptance / Verify:** a ranking test where a low-rated place drops below an otherwise-equal one.

---

### Task 37: Tavily-grounded wellness content
**Size:** M · **Module:** 11

**Files:** `backend/services/tavily.py`, `backend/routers/wellness.py`, `src/app/self-care/page.tsx`, `src/app/stress/page.tsx`

**Steps:**
1. `GET /api/wellness/tips?topic=` where the topic is one of the theme keys (default: the patient's top gated themes).
2. Tavily search with `include_domains` = WHO, NHS, CDC, NIH/MedlinePlus, Mayo Clinic; `search_depth="advanced"`, 5 results.
3. Gemini summarises into ≤ 5 tips, each **required** to carry one of the returned source URLs; tips without a valid source URL are dropped.
4. Cache per topic in `wellness_cache` (TTL index, 7 days).
5. UI: tips list with a visible "Source: nhs.uk ↗" link per tip. The existing grounding, breathing, journaling and meditation tools stay; journal entries move to a `journal_entries` collection if they are currently localStorage (check; add to `USER_COLLECTIONS`).

**Acceptance:** every displayed tip has a working source link from the allow-list.

---

### Task 38: Rate limiting on every AI endpoint
**Size:** S · **Module:** NFR

**Steps:** Apply the Task 3 limiter to every endpoint that calls an LLM, embeddings, Tavily or Maps (per-user keys). Per-minute + per-day limits as set in each task. 429 responses carry `Retry-After`; the frontend shows "You've hit today's limit — try again in N minutes".

**Acceptance / Verify:** one test hitting a limited endpoint past its limit → 429.

---

### Task 39: Move voice translation to FastAPI; delete the Next AI layer
**Size:** S · **Module:** 2

**Files:** `backend/routers/voice.py`, `src/app/story/page.tsx`, `src/app/api/` (delete), `src/lib/gemini.ts` (delete)

**Steps:** Port `translate-voice` (Gemini, temperature 0.2, authenticated, rate-limited 20/min); point `story/page.tsx:223` at it; delete the whole `src/app/api` directory and `src/lib/gemini.ts`.

**Acceptance:** `ls src/app/api` fails; the app builds (`npm run build`).

---

### Task 40: Privacy and logging pass
**Size:** S · **Module:** NFR privacy

**Steps:**
1. Grep backend `print(` / `logging` and frontend `console.*`: remove any that can emit request bodies, story text, chunk text, prompts or LLM output. Replace `print` with `logging` (level from env).
2. The global middleware in `main.py` logs the exception type and path only.
3. Replace the login-page "HIPAA Aligned" badge with an accurate claim ("Your data stays in your account · export or delete anytime") — HIPAA alignment isn't established.
4. Disclaimers: ensure the non-diagnostic line appears on story, insights, chat, recommendations, integrative, Diagnostic Guard, and print.
5. Document in the README what is encrypted at rest (Atlas storage encryption, TLS in transit) and what isn't (field-level → Task 48).

---

### Task 41: Responsive and accessibility pass
**Size:** M · **Module:** UI (brief §8)

**Steps:**
1. Mobile-first at 375 px for Tracker, Chat, Story (brief priority): replace fixed `repeat(N, 1fr)` grids with `repeat(auto-fit, minmax(…, 1fr))` or Tailwind responsive classes; Sidebar collapses to a drawer below `md`.
2. Diagnostic Guard, facility map: simplified single-column mobile view.
3. Keyboard: every interactive element reachable and has a visible focus ring; Radix primitives for dialogs/tabs/accordions/switches where hand-rolled ones exist.
4. Status is never colour-only (icons + text) — check insight types, report field status, open-now badges, confidence.
5. Contrast AA in both themes; `aria-live` for autosave status and streamed chat.
6. Fix the password field width mismatch on `/login` (narrower than the email field).

**Verify:** use the `design:accessibility-review` skill or axe DevTools on the 6 main pages; record results.

---

### Task 42: Deployment and documentation update
**Size:** S

**Steps:** `render.yaml` — backend as Docker (Task 28), all env vars from §3.3, health check path `/health`; README — setup (`uv sync` on Python 3.11, `.env` keys, `create_vector_index.py`, `backfill_chunks.py`, `seed_demo_patient.py`), architecture diagram, an honest "Known limitations" section (Render free-tier cold starts ~50 s break latency targets; appointment requests aren't transmitted; classifier trained on public + synthetic data).

---

## Phase 3 — Bonus

Do these in listed order as time allows. **Task 43 and Task 44 are strongly recommended for the final report** even though they are not in the brief's module table.

### Task 43: LE-RAG evaluation harness (recommended)
**Size:** M

Build 10–15 synthetic patients with known ground-truth themes (some deliberately under-evidenced). Measure:
- **Gate ablation:** insights generated with vs. without the gate; % of insights with < 2 supporting sources in the ungated run.
- **Groundedness:** fraction of insight sentences supported by the cited chunks (LLM-judge + a 20-sample human check).
- **Retrieval quality:** precision@6 of theme-filtered `$vectorSearch` vs. unfiltered.
- **Confidence calibration:** correlation between confidence and human groundedness rating.
Report as tables in the final report. This is the empirical evidence for the platform's main contribution.

### Task 44: Latency benchmark (recommended)
**Size:** S

`backend/scripts/bench.py`: 50 runs each of insight refresh, chat first-token, facility ranking; report p50/p95 against the brief's targets (< 5 s, < 1.5 s, < 2 s) on warm instances; note cold-start behaviour separately.

### Task 45: Option B — LoRA/QLoRA fine-tune of the generation model
**Size:** L

Fine-tune Qwen2.5-3B/7B on curated (evidence chunks → evidence-linked, non-diagnostic insight) pairs built from Task 43's patients plus reviewed LE-RAG outputs. Report perplexity before/after on a held-out set and a 5–10 sample blind human groundedness comparison vs. the base model. Serve on JarvisLabs as `healthcompanion:<version>`.

### Task 46: ML theme tagger
**Size:** M

Replace keyword tagging with multi-label classification (embeddings + one-vs-rest logistic regression, trained on hand-labelled chunks). Compare against keyword tagging with F1 per theme; keep keyword rules as the fallback.

### Task 47: Move the auth token to an httpOnly cookie
**Size:** M

The JWT currently sits in localStorage (XSS-readable). Set an `httpOnly; Secure; SameSite=Lax` cookie on login, add CSRF protection on mutating routes, and switch `fetch` to `credentials: "include"`. Shorten expiry from 7 days and add refresh.

### Task 48: Field-level encryption for narrative text
**Size:** M

Encrypt `stories.story_text`, chunk `text`, `chat_messages.content`, and `doctor_opinions.opinion_text` with Fernet (key from env) or Atlas Queryable Encryption. Embeddings stay unencrypted (required for vector search) — document that as a residual risk.

### Task 49: Push and email reminders
**Size:** M

APScheduler in the backend (or a Render cron job) plus Web Push (VAPID) and/or email for the check-in and medication reminders from Task 33; SSE stream for in-app delivery.

### Task 50: Offline tracker with sync-back
**Size:** M

IndexedDB queue for tracker entries made offline; replay on reconnect; conflict rule: last write per date wins; UI shows "pending sync". This is the one place the brief allows local storage as a transient cache.

### Task 51: Multilingual UI (Tamil first)
**Size:** M

Use `users.settings.language`; message catalogue for UI strings; LLM outputs generated in the chosen language with the same guards. Voice input already translates Tamil.

### Task 52: CI pipeline
**Size:** S

GitHub Actions: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `pytest backend/tests` against an ephemeral test database (or Atlas test cluster via secret).

### Task 53: Labelled demo facility dataset
**Size:** S

`backend/seed/facilities_demo.json` used **only** when `GOOGLE_MAPS_API_KEY` is absent and `DEMO_FACILITIES=true`; every result carries `is_demo: true` and the UI shows a "DEMO DATA — not real facilities" banner. For offline viva demos.

---

## 8. Module → task traceability

| # | Module | Tasks |
|---|---|---|
| 1 | Auth & Onboarding | 1, 3, 47 |
| 2 | Patient Story Analyzer | 7, 12, 13, 16, 39 |
| 3 | Initial Health Survey | 6, 13 |
| 4 | Daily Health Tracker | 5, 13, 50 |
| 5 | Medical Report Analysis | 9, 27, 28, 29 |
| 6 | LE-RAG Insights | 11, 13, 14, 15, 17, 18, 43, 46 |
| 7 | AI Companion Chat | 12, 26 |
| 8 | Diagnostic Guard | 19, 20 |
| 9 | Department Recommendation | 21, 22, 23 |
| 10 | Integrative Care & Facility Finder | 24, 25, 30, 36, 53 |
| 11 | Wellness & Self-Care | 37 |
| 12 | Treatment/Doctor Feedback | 8, 36 |
| 13 | Notifications | 33, 49 |
| 14 | Health Dashboard | 17, 34 |
| 15 | Settings & Privacy | 31, 32, 40, 48 |
| 16 | Reports & PDF Export | 35 |
| NFR | Safety escalation | 12, 16, 26 |
| NFR | Rate limiting | 3, 38 |
| NFR | Performance | 15, 26, 44 |
| NFR | Reliability / fallbacks | 11 |
| §7 | Trained model component | 21, 22 (Option A), 45 (Option B) |

---

## 9. Code to delete

| What | Where | Task |
|---|---|---|
| Unverified Google-token fallback | `backend/auth_utils.py:74-82` | 1 |
| `debug_mongo.py` (prints credentials) | `backend/` | 2 |
| Unused `passlib` dependency | `backend/pyproject.toml` | 2 |
| Next tracker proxy with invented values | `src/app/api/tracker/route.ts` | 5 |
| Next doctor-feedback proxy | `src/app/api/doctor-feedback/route.ts` | 8 |
| Regex "analysis" fallback + `isBackendFallback` hack | `src/app/api/analyze-story/route.ts` | 7, 16 |
| Template-only health insights | `src/app/api/health-insights/route.ts` | 17 |
| Mock doctors, mock integrative suggestions, `enrichWithMockData`, fake community numbers | `src/lib/gemini.ts:112-225, 453-588` | 25, 30 |
| Stub consultancy page | `src/app/consultancy/page.tsx` | 25 |
| Unauthenticated chat route | `src/app/api/chat/route.ts` | 26 |
| Fake "Connect Devices" alert, fake 2FA/session toggles | `src/app/settings/page.tsx` | 31 |
| Hardcoded notifications array | `src/app/notifications/page.tsx:5-13` | 33 |
| Fake dashboard defaults, `demoMode` flag | `src/app/dashboard/page.tsx:9-38`, `src/app/home/page.tsx:64` | 34 |
| Fake patient story in print page | `src/app/reports/print/page.tsx:14` | 35 |
| Hardcoded `CASE-REF: 32DD-F3FC-A069` | `src/app/diagnostic-guard/page.tsx:1443` | 19, 20 |
| Remaining Next AI routes + `gemini.ts` | `src/app/api/`, `src/lib/gemini.ts` | 39 |

---

## 10. Decisions and assumptions

**Defaults taken (change before starting if you disagree):**
1. **AI moves to FastAPI** (Tasks 11–39). Rationale: fixes the missing authentication on all AI routes, gives retrieval direct DB access, and matches the brief's `services/le_rag.py`.
2. **Trained component = Option A** (department classifier). Cheaper than LoRA, and it simultaneously delivers Module 9. Option B stays in Phase 3.
3. **Notifications computed on read + polling** rather than a task queue — meets "real reminders via polling"; a scheduler is added only for push/email (Task 49).
4. **Existing collections keep `user_email`; new ones use `patient_id`.** Avoids a risky migration; `USER_COLLECTIONS` makes export/delete cover both.
5. **Appointment requests are logged, not transmitted** — no partner API exists; the UI says so.
6. **Emergency resources target India** (112, 108, Tele-MANAS 14416) based on the app's `en-IN` locale and Tamil voice input. Verify the numbers before release.

**Provider changes to verify before starting (the brief's names may be outdated):**
- **Embeddings:** Google has been retiring `text-embedding-004` in favour of `gemini-embedding-001` (supports 768-dimension output). Confirm the current model ID; the index dimension (768) must match.
- **Maps:** new Google Cloud projects can't enable the legacy Places and Directions APIs → use **Places API (New)** and the **Routes API** (same product family, different endpoints). Billing must be enabled on the Cloud project.
- **Groq model ID** (e.g. `llama-3.3-70b-versatile`) and **Gemini 2.5 Flash** availability: confirm current IDs.

**Hosting constraints (Render free tier):**
- 512 MB RAM → no PyTorch at inference (ONNX int8 classifier, no EasyOCR, no local sentence-transformers).
- Native Python runtime can't install Tesseract → backend moves to Docker (Task 28).
- Services sleep after ~15 min idle → the first request takes ~50 s; latency targets are measured warm and this is disclosed in the report.

**Open questions for you:**
1. Is the JarvisLabs `healthcompanion` endpoint running, and is it billed per hour? If it's usually off, Gemini is effectively the primary model — the code handles that, but the report should say so.
2. Do you have a Google Cloud project with billing enabled (needed for Places/Routes)?
3. Who reviews the diagnosis → department mapping in Task 21 (ideally someone with clinical knowledge)?

---

## 11. Academic deliverables checklist

For the final report and viva — each item maps to tasks above.

- [ ] Architecture diagram (5 layers, brief §4) reflecting the post-Phase 2 layout — Task 42
- [ ] LE-RAG algorithm description: chunking, theme tagging, gate thresholds, `$vectorSearch` parameters, prompt design, confidence formula with weights and τ — Tasks 13–15
- [ ] LE-RAG evaluation: gate ablation, groundedness, retrieval precision, calibration — Task 43
- [ ] Trained model: dataset sources and licences, label mapping, split table, baseline vs. fine-tuned vs. int8 metrics table, confusion matrix, error analysis — Tasks 21–22
- [ ] NHFRA ranking formula with weights and a worked example — Task 24
- [ ] SPSCD: gap-detection definition (T windows) and contradiction pipeline — Task 19
- [ ] Safety: emergency categories, test cases table, non-diagnostic guard examples — Task 12
- [ ] Non-functional results: latency p50/p95 table vs. targets — Task 44
- [ ] Privacy: data inventory (`USER_COLLECTIONS`), export and erasure demonstration — Task 32
- [ ] Limitations: synthetic data share, non-transmitted appointments, free-tier cold starts, keyword theme tagging (unless Task 46), embeddings stored unencrypted
