"""Synthetic colorectal tumour board preparation; no messages are sent."""

import json
from datetime import date

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import sample_data
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/68", tags=["idea-68"])
DATA_PATH = "issue-68-board.json"


def board_readiness() -> dict:
    board = sample_data.read(DATA_PATH)
    board_day = date.fromisoformat(board["board_date"])
    for patient in board["patients"]:
        results = []
        for requirement in board["requirements"]:
            result = patient["results"][requirement["id"]]
            recorded = date.fromisoformat(result["date"]) if result["date"] else None
            age = (board_day - recorded).days if recorded else None
            state = (
                "missing"
                if recorded is None
                else "outdated"
                if age > requirement.get("max_age_days", float("inf"))
                else "available"
            )
            results.append(
                {
                    **requirement,
                    **result,
                    "state": state,
                    "source_path": DATA_PATH,
                    "rule": (
                        f"Within {requirement['max_age_days']} days of the board (demo rule)."
                        if "max_age_days" in requirement
                        else "Signed result recorded; no expiry in this demo checklist."
                    ),
                }
            )
        patient["results"] = results
        patient["missing_count"] = sum(r["state"] != "available" for r in results)
    return board


class PatientParams(BaseModel):
    patient_id: str


def find_patient(patient_id: str) -> dict:
    for patient in board_readiness()["patients"]:
        if patient["id"] == patient_id:
            return patient
    raise HTTPException(status_code=404, detail="Unknown synthetic board patient")


@define_tool(
    description="Inspect synthetic colorectal board results, sources, freshness rules and contact teams.",
    skip_permission=True,
)
def get_board_readiness(params: PatientParams) -> str:
    return json.dumps(find_patient(params.patient_id))


@router.get("/board")
def get_board() -> dict:
    return board_readiness()


@router.post("/review")
async def review(params: PatientParams) -> dict:
    patient = find_patient(params.patient_id)
    gaps = [r for r in patient["results"] if r["state"] != "available"]
    result = await run_agent(
        AgentRequest(task=f"Check board readiness for {patient['id']}", role="Tumour board coordinator"),
        system_prompt=(
            "You assist a colorectal tumour board coordinator using synthetic data only. "
            "Call get_board_readiness for the requested patient. Use its checklist and freshness rules, "
            "not invented clinical requirements. Explain missing/outdated results, where you looked, "
            "and why required. Use render_ui with evidence and alert/summary blocks, then an actions "
            "block: one item per gap with label exactly its result id, detail a short reminder draft, "
            "and source its recipient team. Never send anything, decide the agenda or recommend treatment."
        ),
        prompt=f"Review {patient['id']} for the synthetic board on {board_readiness()['board_date']}.",
        extra_tools=[get_board_readiness],
    )
    reminders = [
        {
            "id": gap["id"],
            "label": gap["label"],
            "recipient": gap["recipient"],
            "message": (
                f"Hello {gap['recipient']}, please could you provide the {gap['label']} result "
                f"for {patient['name']} ({patient['id']}) before the colorectal board on "
                f"{board_readiness()['board_date']}? The record shows: {gap['detail']} "
                "Please confirm availability or the expected reporting date. Thank you."
            ),
        }
        for gap in gaps
    ]
    if result.mode == "fallback":
        result = AgentResult(
            mode="fallback",
            headline=f"{patient['name']}: {len(gaps)} results need attention" if gaps else "Checklist complete",
            note=f"{result.note} This is a deterministic synthetic checklist review, not live AI.",
            trace=[TraceStep(tool="get_board_readiness", arguments=params.patient_id)],
            blocks=[
                UIBlock(
                    type="evidence",
                    title="Where the checklist looked",
                    items=[
                        UIItem(
                            label=f"{r['label']} · {r['state']}",
                            detail=f"{r['detail']} {r['why']} {r['rule']}",
                            source=f"{r['source']} · {DATA_PATH}",
                        )
                        for r in patient["results"]
                    ],
                ),
                UIBlock(
                    type="alert" if gaps else "summary",
                    title="Coordinator review required",
                    severity="warning" if gaps else "info",
                    body="Requests do not make a result available. You decide whether the patient is discussed.",
                ),
            ],
        )
    else:
        for block in result.blocks:
            if block.type == "actions":
                for item in block.items:
                    for reminder in reminders:
                        if item.label == reminder["id"] and item.detail:
                            reminder["message"] = item.detail
    return {"assessment": result, "reminders": reminders}
