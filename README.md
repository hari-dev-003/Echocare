<div align="center">

# 🩺 EchoCare – AI-Powered Healthcare Companion

### *Every patient story deserves to be heard.*

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000.svg)]()
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)]()
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248.svg)]()
[![JWT](https://img.shields.io/badge/Security-JWT-green.svg)]()
[![AI Powered](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-orange.svg)]()

**An AI-powered healthcare companion that helps users document, understand, and monitor their health journey through explainable AI insights, daily health tracking, and personalized wellness recommendations.**

*Built with Next.js 16 + React 19, FastAPI, MongoDB, and Google Gemini 2.5 Flash.*

</div>

---

# 📖 Table of Contents

- Overview
- Problem Statement
- Solution
- Key Features
- System Workflow
- Technology Stack
- Project Architecture
- Scaling This to Production
- Folder Structure
- Installation
- Environment Variables
- Running the Project
- Known Limitations
- Future Scope
- Team
- Hackathon Journey
- AI Tools Used
- Disclaimer
- License
- Acknowledgements

---

# 📌 Overview

EchoCare is an AI-powered healthcare companion designed for individuals experiencing persistent health concerns despite normal medical reports or inconclusive diagnoses.

Instead of replacing healthcare professionals, EchoCare acts as a digital health companion by helping users document their health journey, organize medical records, monitor daily health activities, receive explainable AI insights, and prepare for more informed consultations with medical professionals.

---

# 🚨 Problem Statement

Millions of people suffer from symptoms that significantly impact their daily lives while routine medical tests often return normal results.

Many patients experience:

- Persistent symptoms
- Multiple doctor visits
- Normal laboratory reports
- Difficulty explaining their complete health history
- Uncertainty about which specialist to consult next

Traditional consultations are often time-limited, making it difficult for healthcare providers to capture the complete patient story.

EchoCare aims to bridge this communication gap by helping users organize and understand their health journey over time.

---

# 💡 Solution

EchoCare provides a centralized platform where users can:

- Record their complete health story
- Maintain their medical history
- Upload medical reports (PDF)
- Track daily health activities
- Receive AI-generated health insights
- Get plain-language explanations of medical reports
- Monitor health trends over time
- Receive wellness/care-pathway recommendations
- Identify appropriate healthcare departments to consult

All AI-generated insights are based solely on user-provided information and are intended to support—not replace—professional medical advice.

---

# ✨ Key Features

## 🔐 Secure Authentication

- Email/password registration & login (bcrypt-hashed passwords)
- Google OAuth 2.0 login (ID token verified against Google's public certs)
- JWT access tokens (HS256, 7-day expiry)

---

## 📝 Patient Story Analyzer

Users write their complete health story in free text — symptoms, previous consultations, pain points, emotional context, lifestyle habits — with autosave drafts.

The story is analyzed by a **custom fine-tuned LLM hosted on JarvisLabs** (`healthcompanion:latest`), cross-checked against a **regex-based symptom/timeline extractor**, and scored with a rule-based confidence function that blends AI output with keyword-level evidence from the raw text.

---

## 📅 Daily Health Tracker

Monitor day-to-day:

- Fatigue, joint pain, brain fog, dizziness
- Mood
- Sleep hours
- Water intake
- Free-text notes

One record per user per day, with 30-day history for trend views.

---

## 📄 Medical Report Upload

- Accepts PDF lab/diagnostic reports
- Extracts text via **PyMuPDF**
- Stores extracted text + metadata (doctor, specialty, report type/date) in MongoDB
- *(Text-layer PDFs only — no OCR for scanned/image reports yet.)*

---

## 🤖 Explainable AI Health Insights

Powered by **Google Gemini 2.5 Flash**, combining:

- Patient story analysis
- Daily tracker averages (sleep, stress, hydration, mood)
- Survey data

Returns structured insight cards: title, plain-language description, supporting evidence, confidence score, and category (warning / success / info).

---

## 🩺 Care-Pathway & Department Suggestions

Ranks five care approaches — **Allopathy, Ayurveda, Siddha, Homeopathy, Naturopathy** — by relevance to the user's symptoms and survey data, each with confidence score, evidence level, typical focus, benefits, limitations, and precautions. Also suggests relevant medical departments (e.g. Rheumatology, Neurology, Endocrinology) with reasoning.

---

## 🎙 Voice Intake

Speech transcripts (Tamil / English / Tanglish) are cleaned and translated into clinical English via a low-temperature Gemini call, preserving medical details without adding new claims.

---

## 💬 Context-Aware Chat

A chat assistant that injects the user's survey answers, story analysis, tracker logs, and uploaded reports into the prompt context, so responses stay grounded in the user's own data.

---

## 📊 Personalized Dashboard

Displays health score, daily tracking trends, AI insights, uploaded reports, and recommendations in one view.

---

## 🌿 Stress Support & 🧘 Self-Care Tools

Dedicated modules for workplace/family stress guidance, grounding and breathing exercises, and journaling — private by design.

---

# 🔄 System Workflow

```text
User Registration (Email/Password or Google OAuth)
        │
        ▼
JWT Issued
        │
        ▼
Patient Story Submission
        │
        ▼
Story Analysis (JarvisLabs LLM + regex extractor)
        │
        ▼
Daily Health Tracking
        │
        ▼
Medical Report Upload (PyMuPDF text extraction)
        │
        ▼
AI Health Insights (Gemini 2.5 Flash)
        │
        ▼
Care-Pathway & Department Recommendations
        │
        ▼
Personalized Dashboard
```

---

# 🛠 Technology Stack

## Frontend

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4
- Radix UI primitives + `class-variance-authority` + `tailwind-merge` (shadcn/ui-style component pattern)
- Framer Motion (animation)
- Recharts (dashboard charts/trends)
- Lucide React (icons)

## Backend

- FastAPI (Python)
- Motor (async MongoDB driver)

## AI & Machine Learning

- Google Gemini 2.5 Flash — insights, story analysis (fallback), integrative suggestions, chat, voice translation
- Custom fine-tuned LLM on JarvisLabs (`healthcompanion:latest`) — primary story analysis
- Regex/heuristic symptom & timeline extraction — parallel signal + fallback

## Authentication

- Google OAuth 2.0
- JWT (python-jose, HS256)
- bcrypt password hashing

## Database

- MongoDB (Atlas) — single database for all collections (users, stories, tracker_logs, reports)

## Report Processing

- PyMuPDF (fitz) — text-layer PDF extraction

## Deployment

- Vercel (frontend)
- Render (backend, per `render.yaml`)

---

# 🏗 Project Architecture

```text
                    ┌───────────────────────────┐
                    │     Next.js Frontend        │
                    │     (Vercel)                 │
                    │                               │
                    │  Pages: dashboard, story,     │
                    │  tracker, insights, chat,     │
                    │  reports, survey, self-care…  │
                    │                               │
                    │  API routes:                  │
                    │  /api/analyze-story            │
                    │  /api/health-insights          │
                    │  /api/integrative               │
                    │  /api/chat                      │
                    │  /api/translate-voice           │
                    └─────────┬──────────┬────────────┘
                              │          │
              JWT (Bearer)    │          │  server-side only
                              │          │
                    ┌─────────▼───┐   ┌──▼──────────────┐
                    │  FastAPI     │   │  Gemini 2.5      │
                    │  (Render)    │   │  Flash API       │
                    │              │   └──────────────────┘
                    │  /api/auth   │   ┌──────────────────┐
                    │  /api/story  │   │  JarvisLabs       │
                    │  /api/tracker│   │  fine-tuned LLM   │
                    └──────┬───────┘   └───────────────────┘
                           │
                    ┌──────▼───────┐
                    │  MongoDB      │
                    │  Atlas        │
                    └───────────────┘
```

**Why two backends:** FastAPI owns durable user data and auth; the Next.js API layer owns AI orchestration, so the Gemini key never reaches the browser and AI prompt logic can iterate independently of the data layer.

---

# 📈 Scaling This to Production

The current build is correctly scoped for a hackathon: one MongoDB instance, no queueing, synchronous AI calls on the request path. Here's how it would evolve toward real scale:

1. **Decouple AI calls from the request/response cycle** — move story analysis and insight generation to a background job queue (Celery/RQ or FastAPI background tasks against Redis) so uploads return instantly and results stream in via polling or a websocket.
2. **Cache and route by cost** — hash-based caching in front of repeated Gemini/JarvisLabs calls; route deterministic sub-tasks (keyword symptom detection) to the existing regex layer instead of the LLM, reserving model calls for genuinely ambiguous input.
3. **Split storage by access pattern** — keep MongoDB for AI-output documents (schema shifts every iteration, no migrations needed), move relational data (accounts, billing, audit trail) to PostgreSQL for integrity and query performance.
4. **Harden auth** — move the JWT from `localStorage` to an httpOnly secure cookie, add refresh tokens, remove any unverified-token fallback path, enforce per-tenant data isolation guarantees.
5. **Add cost & usage observability** — log tokens in/out, latency, and cache hit rate per AI call to produce a real AI-cost-per-active-user metric.
6. **Horizontal scaling** — the backend is already stateless (no in-memory session), so scaling out is a matter of running multiple FastAPI replicas behind a load balancer with MongoDB Atlas handling replication.

---

# 📂 Folder Structure

```text
EchoCare/
├── src/
│   ├── app/
│   │   ├── api/                # Next.js API routes (AI orchestration)
│   │   ├── dashboard/
│   │   ├── story/
│   │   ├── tracker/
│   │   ├── insights/
│   │   ├── chat/
│   │   ├── reports/
│   │   ├── survey/
│   │   ├── self-care/
│   │   ├── stress/
│   │   ├── consultancy/
│   │   └── ... (login, signup, settings, notifications, profile)
│   ├── components/             # AppLayout, Sidebar, Topbar, AuthGuard, AuthProvider
│   └── lib/                    # auth.ts, backend.ts, gemini.ts
│
├── backend/
│   ├── main.py                 # FastAPI app + CORS + lifespan
│   ├── database.py             # MongoDB connection (Motor)
│   ├── auth_utils.py           # JWT, bcrypt, Google token verification
│   └── routers/
│       ├── auth.py
│       ├── story.py
│       └── tracker.py
│
├── public/
├── render.yaml
├── package.json
├── requirements.txt
└── README.md
```

---

# 🚀 Installation

Clone the repository

```bash
git clone https://github.com/Kavincodeg/EchoCare.git
cd EchoCare
```

Install frontend dependencies

```bash
npm install
```

Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
```

---

# 🔑 Environment Variables

**Frontend** — `.env.local`

```env
GEMINI_API_KEY=
NEXT_PUBLIC_BACKEND_URL=
JARVISLABS_LLM_URL=
JARVISLABS_MODEL=
```

**Backend** — `.env`

```env
MONGODB_URI=
MONGODB_DB_NAME=echocare
SECRET_KEY=
GOOGLE_CLIENT_ID=
FRONTEND_URL=
```

---

# ▶ Running the Application

Frontend

```bash
npm run dev
```

Backend

```bash
cd backend
uvicorn main:app --reload
```

Visit

```
http://localhost:3000
```

---

# ⚠ Known Limitations

Being transparent about the current state of the codebase:

- Doctor recommendation lists and "community outcome" statistics are illustrative/hardcoded, not real aggregated data.
- The frontend `doctor-feedback` route forwards to a backend endpoint that isn't implemented yet — feature is stubbed, not wired end-to-end.
- No automated test suite yet.
- PDF processing extracts text only — no OCR for scanned/image-based reports.
- JWT is currently stored in `localStorage`; production hardening would move this to an httpOnly cookie.

---

# 🔮 Future Enhancements

- Background job queue for AI processing
- Redis caching layer for repeated AI calls
- PostgreSQL for relational account/billing data
- OCR support for scanned reports
- Wearable/smartwatch integration
- Doctor portal & appointment scheduling
- Mobile applications
- Automated test suite

---

# 👥 Team

| Team Member | Role |
|-------------|------|
| **Kavin V S** | Project Manager & Fullstack Developer |
| **Savita S** | Business Analyst |
| **Rahul K** | AI/ML Architect |
| **Badri Narayanan B R** | Fullstack Developer |
| **Ruban Prakasam J** | Software Tester |

---

# 🏆 Hackathon Journey

## What We Learned

- Healthcare system analysis
- Prompt engineering for structured, explainable AI output
- Building fault-tolerant AI integrations (fallback generation on API/parse failure)
- Secure authentication (JWT, OAuth)
- User-centered design for a sensitive domain

## Challenges

- Processing unstructured, free-text patient stories reliably
- Balancing AI-generated suggestions with clear precautions and non-diagnostic framing
- Managing healthcare data securely across two backends
- Designing an intuitive experience for an emotionally sensitive use case

## Achievements

- Built a working end-to-end AI healthcare companion in hackathon timeframe
- Implemented a dual-model story analysis pipeline (fine-tuned LLM + regex extraction + confidence scoring)
- Designed AI calls with deterministic fallbacks so the app never breaks on API failure or bad JSON
- Shipped 20+ routed pages across auth, tracking, insights, and self-care

---

# 🤖 AI Tools Used

- Google Gemini 2.5 Flash (product feature)
- Custom fine-tuned LLM on JarvisLabs (product feature)
- GitHub Copilot / ChatGPT (development assistance)

All AI-generated content and code were reviewed and customized by the development team.

---

# ⚠ Disclaimer

EchoCare is intended to support users in organizing and understanding their health information.

It does **not** provide medical diagnoses and should **not** replace consultation with qualified healthcare professionals.

All AI-generated analyses, recommendations, summaries, and insights are generated solely from user-provided information and may contain inaccuracies.

Always consult a licensed healthcare professional before making medical decisions.

---

# 📄 License

This project is licensed under the MIT License.

---

# 🙏 Acknowledgements

Special thanks to:

- **Descience Open Source Club (DOS)** for organizing the hackathon.
- Our mentors and judges for their valuable feedback.
- The open-source community for providing amazing frameworks and tools.

### ⭐ If you like this project, don't forget to give it a Star!

## ❤️ Every patient story deserves to be heard.
