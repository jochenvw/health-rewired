from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent, shutdown
from app.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await shutdown()


app = FastAPI(
    title="Oncology Hackathon 2026 Munich",
    summary="Starter app: FastAPI + GitHub Copilot SDK + generative UI.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Liveness/readiness probe. Must stay fast and dependency-free."""
    return {"status": "ok"}


@app.get("/api/status")
async def status() -> dict:
    return {
        "event": "Oncology Hackathon 2026",
        "city": "Munich",
        "version": settings.app_version,
        "preview_label": settings.preview_label,
        "copilot": {"auth_mode": settings.copilot_auth_mode, "model": settings.copilot_model or "default"},
        "sample_data_files": len(sample_data.list_files()),
    }


@app.get("/api/patients")
async def patients() -> list[dict]:
    return sample_data.list_patients()


@app.get("/api/sample-data")
async def sample_data_index() -> list[str]:
    return sample_data.list_files()


@app.get("/api/sample-data/{path:path}")
async def sample_data_file(path: str):
    try:
        return sample_data.read(path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sample-data file not found") from exc


@app.post("/api/agent/run")
async def agent_run(request: AgentRequest) -> AgentResult:
    return await run_agent(request)


@app.get("/{full_path:path}", include_in_schema=False)
async def spa(full_path: str):
    """Serve the built React app (single container) with SPA fallback to index.html."""
    static = settings.static_dir.resolve()
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
    candidate = (static / full_path).resolve()
    if full_path and static in candidate.parents and candidate.is_file():
        return FileResponse(candidate)
    index = static / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Frontend not built. Run `npm run build` or use `npm run dev`.")
