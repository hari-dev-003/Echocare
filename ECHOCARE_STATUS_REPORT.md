# EchoCare — Status Report (end of session, 2026-09-27)

**Plan:** [ECHOCARE_IMPLEMENTATION_PLAN.md](ECHOCARE_IMPLEMENTATION_PLAN.md) (53 tasks, 4 phases)
**Progress:** Phase 0 complete (Tasks 1–9; Task 10 skipped) · Phase 1 Tasks 11–20 complete · stopped after Task 20 as instructed
**Git:** nothing committed (user instruction). All work is uncommitted on `main`: 43 paths, `30 files changed, 1822 insertions(+), 2363 deletions(-)` in tracked files, plus new files.

---

## 1. Do these first (blocking)

| # | Action | Why |
|---|---|---|
| 1 | **Put a valid Gemini key in `backend/.env`** as `GEMINI_API_KEY=` (or `GOOGLE_API_KEY=`). It is currently **empty**. | Every AI feature returns an honest `503 unavailable` without it: insights, story analysis, contradiction detection, embeddings. |
| 2 | After adding the key: `cd backend && uv run python scripts/backfill_chunks.py` | Embeds the 13 evidence chunks currently stored with `needs_embedding: true`, so vector search can find them. |
| 3 | Restart the backend, then use the app normally (tracker, survey, story → Analyze, reports) and press **Refresh insights** on `/insights`. | First live end-to-end check of the retrieval pipeline. It hasn't been possible yet without a key. |
| 4 | **Rotate the MongoDB Atlas password** and update `MONGODB_URI`. | The deleted `debug_mongo.py` printed the connection string, so it may have appeared in logs. |

---

## 2. Feature status

### 2.1 Fully working now (no API key needed)

| Feature | What works | Where |
|---|---|---|
| **Auth** | Email/password (EmailStr, password ≥ 8 chars, unique email index, 409 on duplicate); Google login with **verified** tokens (the forged-token bypass is fixed; `email_verified` is required; certs are cached with a stale fallback); rate limits on register/login/google; the backend refuses to start without `SECRET_KEY` / `MONGODB_URI` / `GOOGLE_CLIENT_ID`. | `backend/auth_utils.py`, `routers/auth.py`, `limiter.py` |
| **Daily Tracker** | Saves to MongoDB (previously 401 every time). Fields: mood, symptoms, sleep, water glasses, stress, energy, pain, notes, diet, activity, medication, all validated with no invented defaults. History + streak; the Week and Month views are built from real logs. | `routers/tracker.py`, `src/app/tracker/page.tsx` |
| **Initial Survey** | Saves to MongoDB (previously 404). The UI shows "Saved" only after a real save. | `routers/survey.py`, `src/app/survey/page.tsx` |
| **Story drafts + safety** | Draft autosave. **Emergency detection** on Analyze (cardiac, stroke, self-harm, breathing, anaphylaxis, overdose, bleeding, loss of consciousness, with negation handling) shows an emergency banner with 112 / 108 / Tele-MANAS 14416. *Check these numbers before release.* | `services/safety.py`, `components/EmergencyBanner.tsx` |
| **Doctor feedback** | Saves and lists from MongoDB (previously 404). The story page's "Past consultations" now shows these real records. | `routers/feedback.py` |
| **Report upload** | PDF only (magic bytes checked), 10 MB cap, text extraction with an `extraction_status`, listing. | `routers/story.py` |
| **Evidence chunks (LE-RAG step 1)** | Tracker, survey, report and story data are chunked, theme-tagged (14 themes) and stored in `evidence_chunks` on every save, with no duplicates. The Atlas vector index `evidence_vector_idx` is **READY**. | `services/evidence.py`, `themes.py`, `embeddings.py`, `scripts/` |
| **Evidence gate visibility** | `/insights` shows which themes are still "building evidence" (e.g. "2 of 3 occurrences · 1 of 2 source types"). The gate (≥ 3 occurrences, ≥ 2 source types) can't be bypassed. | `services/le_rag.py`, `src/app/insights/page.tsx` |
| **Diagnostic Guard** | Fully moved off localStorage into the `diagnostic_guard` collection. Doctor opinions (also stored as evidence), requested markers, escalation, **symptom-gap detection** (theme present in each of 3 weekly windows and not addressed by a report or opinion), advocacy brief with a real case reference, and a one-time migration of old browser data. All fake patient data is removed. | `routers/diagnostic_guard.py`, `services/diagnostic_guard.py` |
| **Dropdowns** | All 15 dropdowns stay readable in light and dark mode (`color-scheme` plus option colours). Tracker diet, activity and medication keep and save their values. | `globals.css`, tracker page |
| **No demo or fake data** | The demo account and its data are deleted from Atlas; the seed script, demo badge, dashboard demo mode and "Watch Demo" button are removed. Fake dashboard numbers, fake timeline and doctors on the story page, fake notifications, the fake tracker calendar and the fabricated print page are all removed, with proper empty states instead. | several pages |

### 2.2 Built, but needs the Gemini key to produce output (returns an honest 503 until then)

| Feature | Endpoint | Not yet verified live |
|---|---|---|
| **LE-RAG insights**: gate → `$vectorSearch` (k = 6) → grounded prompt → non-diagnostic guard → 4-term confidence score → citations | `GET /api/health-insights`, `POST /api/health-insights/refresh` | A real generated insight card |
| **Story analysis**: extraction of symptoms, onset, severity and timeline, where every item must quote the story verbatim | `POST /api/story/analyze` | Extraction quality |
| **Contradiction detection** between doctor opinions | `POST /api/diagnostic-guard/contradictions/check` | An LLM round-trip |
| **LLM router**: JarvisLabs → Gemini → Groq by task, ending in 503 | `backend/services/llm.py` | That `gemini-2.5-flash` answers live. JarvisLabs and Groq aren't configured, so they're skipped. |
| **Embeddings**: `gemini-embedding-001`, 768 dimensions | `services/embeddings.py` | Live vectors and a real vector search hit |

UI for these: `<EvidenceCard>` (confidence % with a text label, low-confidence flag, "Based on: …" footer with excerpts, disclaimer) is used on `/insights` and for the dashboard's top 3 insights.

### 2.3 Still on the old approach (not yet rebuilt)

| Feature | Current state | Plan task |
|---|---|---|
| **Integrative care / facility finder** | ⚠️ **Still shows fake doctors** (`getMockDoctors()` in `src/lib/gemini.ts`) and hardcoded community percentages. It's the only fake data left in the app, so **fix it first next session.** | 24, 25, 30 |
| **AI chat ("Echo")** | Unauthenticated Next.js route `src/app/api/chat`, whole context stuffed into the prompt, reads `GEMINI_API_KEY` from the *frontend* env (not set), not saved. | 26 |
| **Voice translation** | Unauthenticated Next.js route `src/app/api/translate-voice`. | 39 |
| **Department recommendation** | Page reads localStorage only; no trained model yet. | 21–23 |
| **Settings / Profile** | localStorage only. "Export" dumps localStorage; "Delete account" only clears the browser. | 31, 32 |
| **Notifications** | Empty state; the preference toggles are inert. | 33 |
| **Dashboard aggregates** | Real data where available, but no health-score endpoint yet. | 34 |
| **Consultation summary / print** | "Coming soon" placeholder; the print button is disabled. | 35 |
| **Report download, Cloudinary, OCR, field extraction** | Download is hidden; no OCR yet. | 27–29 |
| **Wellness tips via Tavily** | Static content. | 37 |

---

## 3. What still needs to be built (remaining plan tasks)

**Phase 1 (core), remaining:**
- **Tasks 21–22: department classifier.** Build the dataset (public symptom datasets plus labelled synthetic augmentation, 70/15/15 split), train a TF-IDF+LR baseline vs. DistilBERT, report the metrics table and confusion matrix, export as ONNX int8. *This is the brief's required "trained and evaluated model".*
- **Task 23:** department recommendation endpoint + page.
- **Tasks 24–25:** facility finder using Places API (New), NHFRA ranking and the Routes API. **Delete the mock doctors.** It returns "not configured" until `GOOGLE_MAPS_API_KEY` is set (your decision).

**Phase 2 (improve existing):** Tasks 26–42. Groq chat with retrieval, streaming and saved history; Cloudinary, OCR and report field extraction; honest integrative care; profile and settings in MongoDB with `next-themes`; real export and account deletion; computed notifications; dashboard summary and health score; consultation summary and print; feedback-weighted ranking; Tavily wellness tips; rate limits on all AI routes; moving voice to FastAPI and deleting `src/app/api` and `src/lib/gemini.ts`; privacy and logging pass (including replacing the "HIPAA Aligned" badge); responsive and accessibility pass; deployment and README.

**Phase 3 (bonus):** Tasks 43–53. LE-RAG evaluation harness and latency benchmark (both recommended for the report), LoRA fine-tune, ML theme tagger, httpOnly cookie auth, field encryption, push reminders, offline tracker, Tamil UI, CI. Task 53 (demo facilities) is **cancelled**: no demo data, per your instruction.

**Keys needed later:** `GOOGLE_MAPS_API_KEY` (Tasks 24–25), `GROQ_API_KEY` (chat speed, Task 26; Gemini is the fallback), `TAVILY_API_KEY` (Task 37), `CLOUDINARY_URL` (Task 27), `JARVISLABS_LLM_URL` (optional primary model).

---

## 4. Known issues and deferred items

| Item | Notes |
|---|---|
| `backend/tests/test_database_indexes.py` | 2 tests now fail (their fake DB lacks the new collections). Update or delete them in the final pass. Other tests were not re-run after the no-tests instruction. |
| Legacy collections in Atlas | `chat_messages`, `consultations`, `doctor_feedbacks`, `medical_reports`, `story_analyses`, `tracker_entries`, plus 4 old `surveys` docs keyed by `user_id`, all from an older backend. **Left untouched.** Decide whether to delete them. |
| Feedback rating scale | The backend stores 1–10; the UI's star widgets are 5-star (a `rating/2` shim). |
| Insights `stale` flag | One global flag rather than per theme. |
| `_process_theme` | Doesn't catch non-AI exceptions (a transient Mongo error turns the whole refresh into a 500). |
| Google certs | No backoff during a sustained outage (each login retries a 5 s fetch before using the stale certs). |
| `require_env()` | Duplicated in `auth_utils.py` and `database.py` (4 lines). |
| Lint | Pre-existing `react-hooks/set-state-in-effect` and `no-explicit-any` warnings in several pages. |
| Diagnostic Guard UI | Gap and contradiction panels use an EvidenceCard-style footer, not the `<EvidenceCard>` component itself. |
| Marketing testimonials | `src/app/page.tsx` landing copy, not patient data. Left as is. |

---

## 5. Environment and how to run

- **Env file:** `backend/.env` (there is **no root `.env`**): `MONGODB_URI`, `MONGODB_DB_NAME`, `SECRET_KEY`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GEMINI_API_KEY` (**empty**).
- **Backend:** uv-managed, Python 3.11. `cd backend && uv sync && uv run uvicorn main:app --reload` (port 8000).
- **Frontend:** `npm install && npm run dev` (port 3000). `npx tsc --noEmit` passes.
- **Scripts:** `uv run python scripts/create_vector_index.py` (already done, idempotent) · `uv run python scripts/backfill_chunks.py` (run after adding the key).
- **Backend API (25 routes):** auth (register, login, google, me) · tracker (POST, history) · survey (GET/POST) · story (latest, save-draft, analyze, upload-report, reports) · doctor-feedback (GET/POST) · health-insights (GET, refresh) · diagnostic-guard (GET, opinions POST/DELETE, markers, escalate POST/DELETE, gaps, contradictions/check, brief) · health.

---

## 6. Resuming next session

1. Read this file, then section 2 (Global constraints) of the plan.
2. The detailed task-by-task ledger (with snapshot IDs and deferred items) is at `.superpowers/sdd/ECHOCARE_IMPLEMENTATION_PLAN/progress.md`. It's git-ignored and local only; per-task implementation reports are next to it.
3. Working rules you set: **work directly on `main`, no branches · no commits until all phases are done · no new tests, just one quick runtime check per task · no demo, seed or fake data.**
4. **Suggested next order:** add the Gemini key and verify §2.2 live → Tasks 24–25 (removes the last fake data) → Tasks 21–23 (the trained model the rubric requires) → Phase 2.
