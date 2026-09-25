"""Issue #56 – The cancer patient in the ICU."""

from functools import lru_cache
from typing import Any

from fastapi import APIRouter

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent

router = APIRouter(prefix="/api/ideas/56", tags=["ideas"])
SCENARIO_PATH = "ideas/issue-56/onco-icu-scenario.json"

SYSTEM_PROMPT = """You are an ICU-facing oncology assistant for a hackathon prototype.
Use only the synthetic sample-data tools. Compile a concise Onco-ICU card for the night intensivist:
tumour/stage, current treatment and response, planned next treatment, treatment-related causes,
treatment wishes, missing information, federated descriptive outcomes with uncertainty, and a draft
follow-up message. Never recommend ICU admission or treatment limits; make human judgement explicit.
Finish by calling render_ui exactly once."""


@lru_cache(maxsize=1)
def _scenario() -> dict[str, Any]:
    return sample_data.read(SCENARIO_PATH)


@router.get("/scenario")
async def scenario() -> dict[str, Any]:
    """Return the deterministic synthetic scenario that drives the visible prototype."""
    return _scenario()


@router.post("/agent")
async def agent(request: AgentRequest) -> AgentResult:
    scenario_data = _scenario()
    patient_id = "P-056"
    prompt = f"""
Task from user role {request.role or "on-call intensivist"}: {request.task}

This prototype always uses synthetic patient {patient_id}; ignore any other incoming patient id.

Use these synthetic files as evidence:
- patients/P-056.json
- {SCENARIO_PATH}
- ideas/issue-56/oncology-note.md
- ideas/issue-56/pathology-report.md
- ideas/issue-56/treatment-plan.md
- ideas/issue-56/treatment-wishes-note.md

The deterministic scenario is: {scenario_data["scenario"]}.
Return dense UI blocks that help the intensivist review, not decide. Include missing information and
state that federated outcomes are descriptive synthetic aggregates with uncertainty.
"""
    return await run_agent(
        AgentRequest(task=request.task, patient_id=patient_id, role=request.role),
        system_prompt=SYSTEM_PROMPT,
        prompt=prompt,
    )
