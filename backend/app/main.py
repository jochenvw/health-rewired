from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.agent import run_intent_agent
from app.models import IdeaRequest

app = FastAPI(
    title="Health Rewired Munich 2026 Hackathon",
    summary="Starter app and Copilot SDK demo for Health Rewired hackathon teams.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "oncology-hackathon"}


@app.get("/api/landing")
async def landing() -> dict[str, str]:
    return {
        "title": "Health Rewired",
        "city": "Munich 2026",
        "tagline": "A starting canvas for ambitious oncology ideas.",
    }


@app.post("/api/coach")
async def coach(payload: IdeaRequest) -> dict:
    return await run_intent_agent(payload.idea)


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
