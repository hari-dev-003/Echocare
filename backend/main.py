import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from database import connect_db, close_db
from limiter import limiter
from routers import auth, tracker, story, survey, feedback, insights, diagnostic_guard
from services.llm import LLMUnavailable


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="EchoCare API",
    description="AI-Powered Healthcare Companion — FastAPI Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(LLMUnavailable)
async def llm_unavailable_handler(request: Request, exc: LLMUnavailable):
    return JSONResponse(
        status_code=503,
        content={"state": "unavailable", "message": "AI insights are temporarily unavailable. Your data is saved."},
    )

# ── CORS ──────────────────────────────────────────────────────────────────────
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def allow_private_network(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as e:
        print("Exception in middleware:", e)
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error"}
        )
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(tracker.router)
app.include_router(story.router)
app.include_router(survey.router)
app.include_router(feedback.router)
app.include_router(insights.router)
app.include_router(diagnostic_guard.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "EchoCare API is running 🩺",
        "version": "1.0.0",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
