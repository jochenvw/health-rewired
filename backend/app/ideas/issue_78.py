"""Synthetic trial screening, never an eligibility decision or treatment recommendation."""

import asyncio
import json
import operator
from datetime import date
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent.models import AgentRequest, AgentResult
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/78", tags=["trial matching"])
Horizon = Literal["six-month", "future"]
DATA = "issue-78-trial-matching.json"


class ScreeningRequest(BaseModel):
    horizon: Horizon = "future"
    trial_ids: list[str] = Field(default_factory=list, max_length=4)


def screening(horizon: Horizon) -> dict:
    data = sample_data.read(DATA)
    dataset = sample_data.read("minimal-mdt-dataset.json")
    elements = {
        element["name"]: {**element, "group": group["group"]}
        for group in dataset["groups"]
        for element in group["elements"]
    }
    facts = {}
    coverage = []
    for key, fact in data["facts"].items():
        available = horizon == "future" or fact["six_month_available"]
        facts[key] = {
            **fact,
            "value": fact["value"] if available else None,
            "display": fact["display"] if available else "Not structured in the six-month dataset",
            "source": fact["source"] if available else "Clinic notes not mapped in this hospital demo",
        }
        element = elements.get(fact["dataset"])
        coverage.append(
            {
                "name": fact["dataset"],
                "group": element["group"] if element else "Outside minimal dataset",
                "likely_source": element["likely_source"] if element else "Not in dataset",
                "status": "Available" if available and fact["value"] is not None else "Missing",
            }
        )
    trials = []
    for trial in data["trials"]:
        if horizon == "six-month" and trial["scope"] != "local":
            continue
        criteria = []
        for criterion in trial["criteria"]:
            fact = facts[criterion["field"]]
            value = fact["value"]
            reason = fact["display"]
            unknown = value is None
            if not unknown and criterion.get("max_age_days"):
                age = (
                    (date.fromisoformat(data["snapshot_date"]) - date.fromisoformat(fact["date"])).days
                    if fact.get("date")
                    else None
                )
                if age is None or age < 0 or age > criterion["max_age_days"]:
                    unknown = True
                    reason = "A current, dated result is required; available evidence is outside the trial window."
            if unknown:
                status = "Unknown"
            else:
                expected = criterion["expected"]
                matches = {"eq": operator.eq, "gte": operator.ge, "lte": operator.le, "lt": operator.lt}[
                    criterion["op"]
                ](value, expected)
                status = "Match" if matches else "Conflict"
            criteria.append(
                {
                    **criterion,
                    "status": status,
                    "patient_label": fact["label"],
                    "patient_value": fact["display"],
                    "evidence": reason,
                    "source": fact["source"],
                    "protocol_source": f"{DATA} · {trial['id']} synthetic protocol §{criterion['id']}",
                }
            )
        counts = {status: sum(c["status"] == status for c in criteria) for status in ("Match", "Conflict", "Unknown")}
        gaps = [c for c in criteria if c["status"] == "Unknown"]
        enquiry = (
            f"Draft screening enquiry — {data['patient']['name']} ({data['patient']['id']}) / {trial['title']}.\n"
            f"Recorded diagnosis: {data['patient']['diagnosis']}. "
            "Please review the full protocol before considering enrolment. "
            + ("Outstanding evidence: " + "; ".join(c["text"] for c in gaps) + ". " if gaps else "")
            + "Please confirm current recruitment, complete eligibility, risks, alternatives and patient preference. "
            "Eligibility is not confirmed. No orders or referrals have been sent."
        )
        trials.append(
            {
                **trial,
                "criteria": criteria,
                "counts": counts,
                "assessment": (
                    "Conflict identified"
                    if counts["Conflict"]
                    else "Potential match · checks outstanding"
                    if counts["Unknown"]
                    else "Recorded criteria supported · trial-team confirmation required"
                ),
                "enquiry_note": enquiry,
                "proposed_orders": [f"Proposed evidence request: {c['text']}" for c in gaps],
            }
        )
    candidates = sorted(
        [t for t in trials if not t["counts"]["Conflict"] and t["status"] == "Recruiting"],
        key=lambda t: t["scope"] != "local",
    )[:4]
    return {
        "patient": data["patient"],
        "snapshot_date": data["snapshot_date"],
        "facts": facts,
        "trials": candidates,
        "excluded_count": sum(bool(t["counts"]["Conflict"]) for t in trials),
        "excluded_trials": [t for t in trials if t["counts"]["Conflict"]],
        "coverage": coverage,
        "horizon": horizon,
        "notice": "Synthetic screening only. Not confirmed eligibility or a treatment recommendation.",
    }


@router.get("/context")
def context(horizon: Horizon = "future"):
    return screening(horizon)


@router.post("/review")
async def review(request: ScreeningRequest):
    assessment = screening(request.horizon)
    if request.trial_ids:
        allowed = {trial["id"] for trial in assessment["trials"]}
        if not set(request.trial_ids) <= allowed:
            raise HTTPException(status_code=422, detail="Select only current conflict-free screening candidates.")
        assessment["trials"] = [t for t in assessment["trials"] if t["id"] in request.trial_ids]

    @define_tool(description="Read the synthetic patient evidence and trial criterion comparisons for this horizon.")
    async def inspect_trial_screening(params: ScreeningRequest) -> dict:
        return assessment

    try:
        result = await asyncio.wait_for(
            run_agent(
                AgentRequest(
                    task="Review potential trial matches and missing evidence", patient_id="TM-078", role="Oncologist"
                ),
                system_prompt=(
                    "You support synthetic oncology trial screening. Call inspect_trial_screening, then render_ui "
                    "with a concise prior-phase evidence comparison, subgroup findings and limitations. "
                    "All results are invented synthetic examples, not publications. Current studies are ongoing. "
                    "Cite the supplied protocol and record sources. "
                    "Match means only that one criterion is supported, never confirmed eligibility. "
                    "Keep conflicts and unknowns explicit; never recommend treatment or referral. "
                    "Do not read other patients or use other sample data. "
                    "All referral decisions belong to the oncologist. "
                    "For EACH candidate render an actions block with title EXACTLY its trial id "
                    "and body an enquiry note "
                    "for the trial team. Include outstanding evidence and proposed checks; no actual orders, sends, "
                    "enrolment, patient-specific treatment recommendations or invented clinical history."
                ),
                prompt=f"Review this {request.horizon} assessment: {json.dumps(assessment)}",
                extra_tools=[inspect_trial_screening],
                fallback_builder=lambda _request, note: demo_review(assessment, note),
            ),
            timeout=40,
        )
    except TimeoutError:
        result = demo_review(assessment, "Assistant review timed out. Editable synthetic demo drafts remain available.")
    notes = {t["id"]: t["enquiry_note"] for t in assessment["trials"]}
    if result.mode == "copilot":
        for block in result.blocks:
            if block.type == "actions" and block.title in notes and block.body:
                notes[block.title] = block.body
    return {**result.model_dump(), "enquiry_notes": notes}


def demo_review(assessment: dict, note: str) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="Screening candidates — evidence and enquiry drafts ready for clinician review",
        note=note,
        blocks=[
            *[
                UIBlock(
                    type="evidence",
                    title=f"{candidate['title']} · {candidate['assessment']}",
                    body=assessment["notice"],
                    items=[
                        UIItem(
                            label=f"{c['status']} · {c['text']}",
                            detail=c["evidence"],
                            source=f"{c['source']} → {c['protocol_source']}",
                            severity="warning" if c["status"] == "Unknown" else "info",
                        )
                        for c in candidate["criteria"]
                    ],
                )
                for candidate in assessment["trials"]
            ],
            UIBlock(
                type="evidence",
                title="Prior-phase comparison · invented examples, not clinical evidence",
                body="Do not compare response percentages as if these were head-to-head studies. "
                "Subgroups are small; all recruiting current phases have no results.",
                items=[
                    UIItem(
                        label=f"{candidate['title']} · phase {evidence['phase']}",
                        detail=f"{evidence['population']}: {evidence['result']} {evidence['limitation']}",
                        source=evidence["source"],
                    )
                    for candidate in assessment["trials"]
                    for evidence in candidate["evidence_track"]
                ],
            ),
            UIBlock(
                type="actions",
                title="For the oncologist to consider",
                body="Obtain current renal function; verify performance status "
                "and the full protocol with the trial team. "
                "No tests ordered, referrals sent or treatments recommended.",
            ),
            *[
                UIBlock(type="actions", title=candidate["id"], body=candidate["enquiry_note"])
                for candidate in assessment["trials"]
            ],
        ],
    )
