"""Synthetic colorectal board preparation; requests remain proposals for human review."""

import json

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import sample_data
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/70", tags=["idea-70"])
DATA_PATH = "issue-70-board.json"


class CheckRequest(BaseModel):
    patient_id: str


def source_check(patient_id: str) -> dict:
    board = sample_data.read(DATA_PATH)
    patient = next((p for p in board["patients"] if p["id"] == patient_id), None)
    if patient is None:
        raise HTTPException(status_code=404, detail="Synthetic board patient not found")
    missing = [
        {**requirement, **patient["results"][requirement["id"]]}
        for requirement in board["requirements"]
        if not patient["results"][requirement["id"]]["available"]
    ]
    return {"patient": patient, "missing": missing, "scheduled": board["scheduled"]}


@define_tool(description="Check synthetic lab, pathology, radiology and endoscopy sources for a board patient.")
async def check_board_sources(params: CheckRequest) -> dict:
    return source_check(params.patient_id)


@router.post("/check")
async def check(request: CheckRequest):
    checked = source_check(request.patient_id)
    patient = checked["patient"]
    drafts = [
        {
            "id": missing["id"],
            "label": missing["label"],
            "contact": missing["contact"],
            "source": missing["source"],
            "reason": missing["detail"],
            "body": (
                f"Dear {missing['contact']},\n\n"
                f"Please confirm the status of {missing['label']} for {patient['name']} "
                f"({patient['id']}) ahead of the colorectal board on 15 October at 14:00. "
                f"Our synthetic record shows: {missing['detail']}. "
                "Could you provide the signed report, or let us know when it is expected?\n\n"
                "Thank you,\nTumour board coordinator"
            ),
        }
        for missing in checked["missing"]
    ]
    result = await run_agent(
        AgentRequest(
            task="Check colorectal board readiness and propose missing-result requests.", role="MDT coordinator"
        ),
        system_prompt=(
            "You prepare a synthetic colorectal tumour board. Use check_board_sources for the "
            "provided patient; do not use unrelated patient records. Explain missing results with "
            "their source and suggested contact. Never make treatment or board-inclusion decisions. "
            "No messages are sent. Call render_ui with evidence and summary blocks, and one actions "
            "block per missing result: title must be its exact requirement id, body a short request "
            "for the coordinator to edit and approve. A request is not a received result."
        ),
        prompt=f"Check patient {request.patient_id}. Synthetic source snapshot: {json.dumps(checked)}",
        extra_tools=[check_board_sources],
    )
    if result.mode == "fallback":
        result = AgentResult(
            mode="fallback",
            headline=f"{len(drafts)} results outstanding for {patient['name']}",
            note=result.note,
            trace=[TraceStep(tool="check_board_sources", arguments=request.patient_id)],
            blocks=[
                UIBlock(
                    type="evidence",
                    title="Source check · synthetic records",
                    body="Requests are drafts only. The coordinator decides whether to discuss or postpone.",
                    items=[
                        UIItem(
                            label=draft["label"],
                            detail=f"{draft['reason']} → Ask {draft['contact']}",
                            source=draft["source"],
                            severity="warning",
                        )
                        for draft in drafts
                    ],
                )
            ],
        )
    else:
        for draft in drafts:
            generated = next(
                (b.body for b in result.blocks if b.type == "actions" and b.title == draft["id"] and b.body),
                None,
            )
            if generated:
                draft["body"] = generated
    return {"agent": result, "drafts": drafts}
