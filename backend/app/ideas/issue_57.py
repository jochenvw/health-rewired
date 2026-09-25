import json
from typing import Any

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/57", tags=["idea-57"])

DATA_PATH = "trial-design/issue-57-population.json"


class TrialQueryParams(BaseModel):
    criteria: str = Field(description="Draft protocol eligibility criteria to evaluate")
    kidney_threshold: int = Field(default=60, ge=30, le=90, description="eGFR threshold to test")


def _snapshot() -> dict[str, Any]:
    data = sample_data.read(DATA_PATH)
    centres = data["centres"]
    data["totals"] = {
        "registry": sum(c["registry"] for c in centres),
        "strict_eligible": sum(c["strict_eligible"] for c in centres),
        "adjusted_eligible": sum(c["adjusted_eligible"] for c in centres),
        "older_registry": sum(c["older_registry"] for c in centres),
        "older_strict_eligible": sum(c["older_strict_eligible"] for c in centres),
        "older_adjusted_eligible": sum(c["older_adjusted_eligible"] for c in centres),
        "egfr_excluded": sum(c["egfr_excluded"] for c in centres),
        "egfr_excluded_older": sum(c["egfr_excluded_older"] for c in centres),
    }
    return data


@define_tool(description="Run synthetic federated trial-feasibility counts for issue 57.", skip_permission=True)
def federated_trial_feasibility(params: TrialQueryParams) -> str:
    snapshot = _snapshot()
    snapshot["requested_criteria"] = params.criteria
    snapshot["tested_kidney_threshold"] = params.kidney_threshold
    return json.dumps(snapshot)


@router.get("/feasibility")
async def feasibility() -> dict[str, Any]:
    return _snapshot()


@router.post("/agent")
async def agent(request: AgentRequest) -> AgentResult:
    prompt = f"""
You are helping a clinical trial coordinator design a second-line metastatic colorectal-cancer trial.
Convert the draft criteria into reviewable executable rules, use federated_trial_feasibility to compare
the strict kidney threshold against the adjusted threshold, and render UI blocks that explain:
1. which rules were derived,
2. which criterion excludes older patients disproportionately,
3. what human protocol decision remains.

Draft criteria:
{request.task}
"""
    result = await run_agent(
        request,
        system_prompt=(
            "You are a trial feasibility assistant. Use only synthetic data. "
            "Always call federated_trial_feasibility before render_ui. "
            "Do not choose criteria; propose what humans should review."
        ),
        prompt=prompt,
        extra_tools=[federated_trial_feasibility],
    )
    if result.mode == "copilot":
        return result

    snapshot = _snapshot()
    return AgentResult(
        mode="fallback",
        headline="Draft criteria converted to reviewable trial rules",
        note=(
            "Copilot SDK is not configured, so this deterministic demo shows the same synthetic "
            "federated feasibility path."
        ),
        trace=[
            *result.trace,
            TraceStep(tool="federated_trial_feasibility", arguments="synthetic six-centre aggregate counts"),
        ],
        blocks=[
            UIBlock(
                type="summary",
                title="AI-readable rule set",
                body=(
                    "The free-text protocol maps to diagnosis, treatment line, ECOG, kidney-function "
                    "and comorbidity rules. The kidney rule is marked for human safety review."
                ),
            ),
            UIBlock(
                type="alert",
                title="Representativeness warning",
                severity="warning",
                body=(
                    "The strict eGFR ≥60 rule excludes 49% of patients aged 70 or older in the "
                    "synthetic registry before any patient is approached."
                ),
                items=[
                    UIItem(
                        label="Strict threshold",
                        detail=f"{snapshot['totals']['strict_eligible']} eligible across six centres",
                        severity="warning",
                        source=DATA_PATH,
                    ),
                    UIItem(
                        label="Adjusted threshold",
                        detail=f"{snapshot['totals']['adjusted_eligible']} eligible with renal safety review",
                        severity="info",
                        source=DATA_PATH,
                    ),
                ],
            ),
            UIBlock(
                type="actions",
                title="Human protocol decision",
                items=[
                    UIItem(label="Keep eGFR ≥60 for safety and accept a less representative cohort"),
                    UIItem(label="Review eGFR ≥45 with renal monitoring before ethics submission"),
                ],
            ),
        ],
    )
