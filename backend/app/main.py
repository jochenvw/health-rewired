from pathlib import Path

import asyncio
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.agent import run_intent_agent
from app.mdo import DEMO_CASE, DEMO_DECISION, generate_documents, validate_decision, voice_config
from app.models import GenerationRequest, IdeaRequest, MDODecision, VoiceRequest

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
    return {"status": "ok", "service": "health-rewired-munich"}


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


audit_events: list[dict] = []


def record_audit(event: dict) -> None:
    audit_events.append(event)
    del audit_events[:-100]


@app.get("/api/mdo/demo")
async def mdo_demo() -> dict:
    return {"case": DEMO_CASE.model_dump(), "decision": DEMO_DECISION.model_dump(), "voices": voice_config()}


@app.post("/api/mdo/decision")
async def save_decision(payload: MDODecision) -> dict:
    missing = validate_decision(payload)
    record_audit({"event": f"decision_{payload.status}", "actor": payload.approved_by or "clinician", "synthetic": True})
    return {"decision": payload.model_dump(), "missing": missing, "saved": True}


@app.post("/api/mdo/generate")
async def generate_mdo_documents(payload: GenerationRequest) -> dict:
    result = generate_documents(payload.case, payload.decision, payload.preferences)
    record_audit({"event": "communications_generated", "actor": payload.decision.approved_by, "synthetic": payload.case.synthetic})
    return result


@app.get("/api/mdo/audit")
async def mdo_audit() -> dict:
    return {"events": audit_events[-100:]}


def _elevenlabs_audio(voice_id: str, text: str) -> bytes:
    request = Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
        data=json.dumps({
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode(),
        headers={"Content-Type": "application/json", "xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
        method="POST",
    )
    with urlopen(request, timeout=20) as response:
        return response.read()


@app.post("/api/mdo/voice")
async def synthesize_voice(payload: VoiceRequest):
    config = next((item for item in voice_config() if item["role"] == payload.role), None)
    if not config:
        raise HTTPException(status_code=404, detail="Unknown specialist voice.")
    if not os.getenv("ELEVENLABS_API_KEY") or not config["voice_id"]:
        raise HTTPException(status_code=503, detail="External voice unavailable; use browser speech synthesis.")
    try:
        audio = await asyncio.to_thread(_elevenlabs_audio, config["voice_id"], payload.text)
    except HTTPError as exc:
        status = 429 if exc.code == 429 else 502
        raise HTTPException(status_code=status, detail="Voice provider rate limited or rejected generation.") from exc
    except (URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Voice provider is temporarily unavailable.") from exc
    return StreamingResponse(iter([audio]), media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=300"})


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
