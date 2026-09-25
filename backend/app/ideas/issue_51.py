"""Issue 51: silent-run model validation workspace."""

import json
from typing import Any

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem
from app.config import settings

router = APIRouter(prefix="/api/ideas/51", tags=["issue-51"])

DATA_PATH = "model-validation/issue-51-hospitals.json"


class PassportRequest(BaseModel):
    hospital_id: str = "C"
    committee_focus: str = "Should we introduce, recalibrate or keep silent-running the model?"


class NoParams(BaseModel):
    pass


def _snapshot() -> dict[str, Any]:
    return sample_data.read(DATA_PATH)


def _hospital(snapshot: dict[str, Any], hospital_id: str) -> dict[str, Any]:
    hospitals = snapshot["hospitals"]
    return next((hospital for hospital in hospitals if hospital["id"] == hospital_id), hospitals[-1])


def _passport_fallback(request: PassportRequest) -> AgentResult:
    snapshot = _snapshot()
    hospital = _hospital(snapshot, request.hospital_id)
    recalibration = snapshot["recalibration"]
    passport = snapshot["passport"]
    before = recalibration["before"]
    after = recalibration["after"]
    return AgentResult(
        mode="fallback",
        headline=f"Draft model passport for Hospital {hospital['id']}",
        note="Copilot SDK not configured; showing deterministic passport draft from synthetic validation data.",
        trace=[TraceStep(tool="get_model_validation_snapshot", arguments=DATA_PATH)],
        blocks=[
            UIBlock(
                type="summary",
                title="Committee recommendation",
                body=passport["recommended_decision"],
                items=[
                    UIItem(label="Human decision needed", detail=request.committee_focus, severity="warning"),
                    UIItem(
                        label="Silent run", detail="Predictions are not visible in clinical care.", source=DATA_PATH
                    ),
                ],
            ),
            UIBlock(
                type="evidence",
                title=f"Why Hospital {hospital['id']} differs",
                body=hospital["likely_cause"],
                items=[
                    UIItem(
                        label="AUC", detail=f"{hospital['auc']} vs publication {snapshot['model']['published_auc']}"
                    ),
                    UIItem(label="Calibration slope", detail=f"{hospital['calibration_slope']} before recalibration"),
                    UIItem(label="Drift", detail=hospital["drift_flag"], severity="critical"),
                    UIItem(label="Fairness", detail=hospital["fairness_flag"], severity="warning"),
                ],
            ),
            UIBlock(
                type="evidence",
                title="Effect of recalibration",
                body=recalibration["committee_note"],
                items=[
                    UIItem(
                        label="Before",
                        detail=f"Slope {before['calibration_slope']} · Brier {before['brier']}",
                    ),
                    UIItem(
                        label="After",
                        detail=f"Slope {after['calibration_slope']} · Brier {after['brier']}",
                    ),
                    UIItem(label="Method", detail=recalibration["method"], source=DATA_PATH),
                ],
            ),
            UIBlock(
                type="actions",
                title="Sign-off options",
                items=[UIItem(label=option) for option in passport["decision_options"]],
            ),
        ],
    )


@define_tool(description="Read the synthetic model-validation snapshot for issue 51.", skip_permission=True)
def get_model_validation_snapshot(_: NoParams) -> str:
    return json.dumps(_snapshot())


@router.get("/snapshot")
async def snapshot() -> dict[str, Any]:
    return _snapshot()


@router.post("/passport")
async def passport(request: PassportRequest) -> AgentResult:
    if settings.copilot_auth_mode == "not-configured":
        return _passport_fallback(request)

    snapshot = _snapshot()
    hospital = _hospital(snapshot, request.hospital_id)
    prompt = f"""
Draft the model passport for the hospital AI decision committee.

Use only the synthetic validation snapshot from get_model_validation_snapshot.
Focus hospital: {hospital["id"]} - {hospital["name"]}.
Committee question: {request.committee_focus}

Return concise UI blocks with:
1. the recommended decision,
2. discrimination, calibration, subgroup fairness and drift evidence,
3. the likely cause of any performance difference,
4. the effect of recalibration,
5. explicit human sign-off options.
Make clear that silent-run predictions are not shown to clinicians or patients.
"""
    return await run_agent(
        AgentRequest(task=request.committee_focus, role="Hospital AI implementation team"),
        system_prompt=(
            "You help a hospital AI decision committee validate an oncology prediction model. "
            "Use tools, cite synthetic evidence, and never imply the model is used for care during silent running."
        ),
        prompt=prompt,
        extra_tools=[get_model_validation_snapshot],
    )
