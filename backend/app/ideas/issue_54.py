"""Issue 54: immunotherapy side-effect triage prototype."""

import json
from typing import Any, Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem
from app.config import settings

router = APIRouter(prefix="/api/ideas/54", tags=["ideas"])

DATA_PATH = "ideas/issue-54/toxicity-worklist.json"
SYSTEM_PROMPT = """You are an oncology triage assistant inside a hackathon prototype.
Use only the synthetic issue-54 triage data returned by the tool. Combine symptoms, laboratory trends,
notes and network outcomes. Propose CTCAE severity and protocol steps, but make clear that the nurse
and oncologist decide whether to call, order tests, assess same-day, pause or change treatment.
Always end by rendering concise UI blocks for a nurse reviewing the selected patient.
"""


class TriageAssistantRequest(BaseModel):
    patient_id: str = Field(pattern=r"^IOT-54\d{2}$")
    action: Literal["call", "tests", "same-day", "dismiss", "review"] = "review"


class Issue54CaseParams(BaseModel):
    patient_id: str = Field(description="Synthetic issue-54 patient id, e.g. IOT-5401")


def _data() -> dict[str, Any]:
    return sample_data.read(DATA_PATH)


def _patients() -> list[dict[str, Any]]:
    return _data()["patients"]


def _find_patient(patient_id: str) -> dict[str, Any]:
    for patient in _patients():
        if patient["id"] == patient_id:
            return patient
    raise HTTPException(status_code=404, detail="Synthetic triage patient not found")


@define_tool(description="Read one synthetic issue-54 immunotherapy triage case.", skip_permission=True)
def get_issue54_triage_case(params: Issue54CaseParams) -> str:
    try:
        return json.dumps(_find_patient(params.patient_id))
    except HTTPException:
        return json.dumps({"error": "unknown patient", "known": [p["id"] for p in _patients()]})


@router.get("/worklist")
async def worklist() -> dict[str, Any]:
    data = _data()
    patients = sorted(data["patients"], key=lambda row: row["priority"], reverse=True)
    return {**data, "patients": patients}


def _deterministic_result(patient: dict[str, Any], action: str) -> AgentResult:
    trace = [
        TraceStep(tool="read_sample_data", arguments=DATA_PATH),
        TraceStep(tool="get_issue54_triage_case", arguments=patient["id"]),
    ]
    action_label = {
        "call": "Nurse chose to call the patient",
        "tests": "Nurse chose to order tests",
        "same-day": "Nurse chose same-day assessment",
        "dismiss": "Nurse marked low-risk / no action now",
        "review": "Nurse is reviewing the recommendation",
    }[action]
    return AgentResult(
        mode="fallback",
        headline=f"Triage synthesis for {patient['name']}",
        note="Copilot SDK is not configured, so this is the deterministic issue-54 demo path.",
        trace=trace,
        blocks=[
            UIBlock(
                type="alert",
                title=f"{patient['organ_signal']} · {patient['risk_label']}",
                severity="critical"
                if patient["risk_tone"] == "crit"
                else "warning"
                if patient["risk_tone"] == "warn"
                else "info",
                body=patient["grade_rationale"],
                items=[
                    UIItem(label=patient["ctcae_grade"], detail=patient["protocol_step"], source="synthetic protocol"),
                    UIItem(
                        label=patient["network_match"]["label"],
                        detail="Synthetic network outcome lookup; not real-world evidence.",
                        source=DATA_PATH,
                    ),
                ],
            ),
            UIBlock(
                type="evidence",
                title="Evidence combined",
                items=[
                    *[
                        UIItem(
                            label=f"{item['date']} · {item['label']} (G{item['grade']})",
                            detail=item["source"],
                            source="synthetic symptoms",
                        )
                        for item in patient["symptoms"]
                    ],
                    *[
                        UIItem(
                            label=f"{item['date']} · {item['test']} {item['value']} {item['unit']}",
                            detail=item["flag"],
                            source="synthetic labs",
                            severity="warning" if item["flag"] != "normal" else None,
                        )
                        for item in patient["labs"]
                    ],
                    *[
                        UIItem(
                            label=f"{item['date']} · {item['text']}", detail=item["source"], source="synthetic notes"
                        )
                        for item in patient["notes"]
                    ],
                ],
            ),
            UIBlock(
                type="actions",
                title="Human decision recorded for this prototype",
                body=patient["draft_note"],
                items=[
                    UIItem(
                        label=action_label, detail="Nothing is sent to the patient or filed unless the nurse approves."
                    ),
                    UIItem(
                        label="Edit triage note before filing", detail="Human-in-the-loop review remains mandatory."
                    ),
                ],
            ),
        ],
    )


@router.post("/assistant")
async def assistant(request: TriageAssistantRequest) -> AgentResult:
    patient = _find_patient(request.patient_id)
    if settings.copilot_auth_mode == "not-configured":
        return _deterministic_result(patient, request.action)

    prompt = f"""Review synthetic issue-54 patient {request.patient_id} for the oncology triage nurse.
The nurse-selected action is: {request.action}.
Use get_issue54_triage_case for the source data. Return: risk signal, CTCAE grade rationale,
protocol step, similar synthetic network outcome, source evidence, and a draft triage note for human approval.
"""
    return await run_agent(
        AgentRequest(
            task="Detect immune-related side-effect signal", patient_id=request.patient_id, role="Oncology triage nurse"
        ),
        system_prompt=SYSTEM_PROMPT,
        prompt=prompt,
        extra_tools=[get_issue54_triage_case],
    )
