---
applyTo: "backend/**"
---

# Backend (FastAPI + GitHub Copilot SDK)

- Python 3.11+, managed with `uv` (`cd backend && uv add <pkg>`). Never edit `uv.lock` by hand.
- Agent code lives in `backend/app/agent/`:
  - `runner.py` – Copilot SDK client/session lifecycle. Reuse `run_agent()`; do not create another client.
  - `tools.py` – tools the model can call. Add a Pydantic params model + `@define_tool` function
    and append it to `TOOLS`. Tools must be read-only unless the idea explicitly needs an action,
    and actions must return a proposal for a human to approve rather than performing it silently.
  - `ui.py` – the generative UI block schema (`UIBlock`). Adding a block type means adding it to
    `BlockType` here **and** a React component in `frontend/src/blocks/`.
  - `prompts.py` – system prompt. Keep it short and role/task specific.
  - `fallback.py` – deterministic response when the SDK is not configured. Keep it working.
- Sample data access goes through `backend/app/sample_data.py` (reads `/sample-data`). No database.
- **Idea-specific code** goes in `backend/app/ideas/issue_<N>.py` with
  `router = APIRouter(prefix="/api/ideas/<N>")`; routers are discovered automatically, so do not
  edit `main.py`. Call `run_agent(request, system_prompt=..., prompt=..., extra_tools=[...])`.
- All API routes are under `/api`. `/api/health` must stay dependency-free and fast.
- Tests: `backend/tests/`, run with `uv run pytest`. Tests must not require a Copilot token.
- Lint/format: `uv run ruff check . && uv run ruff format .`
