"""Synthetic trial screening, never an eligibility decision or treatment recommendation."""

import json
import operator
from datetime import date
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent.models import AgentRequest, AgentResult
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/78", tags=["trial matching"])
Horizon = Literal["six-month", "future"]
DATA = "issue-78-trial-matching.json"


class ScreeningRequest(BaseModel):
    horizon: Horizon = "future"


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
                matches = {"eq": operator.eq, "gte": operator.ge, "lte": operator.le}[criterion["op"]](value, expected)
                status = "Match" if matches else "Conflict"
            criteria.append(
                {
                    **criterion,
                    "status": status,
                    "evidence": reason,
                    "source": fact["source"],
                    "protocol_source": f"{DATA} · {trial['id']} synthetic protocol §{criterion['id']}",
                }
            )
        counts = {status: sum(c["status"] == status for c in criteria) for status in ("Match", "Conflict", "Unknown")}
        trials.append(
            {
                **trial,
                "criteria": criteria,
                "counts": counts,
                "assessment": "Conflict identified" if counts["Conflict"] else "Potential match · checks outstanding",
            }
        )
    return {
        "patient": data["patient"],
        "snapshot_date": data["snapshot_date"],
        "facts": facts,
        "trials": trials,
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

    @define_tool(description="Read the synthetic patient evidence and trial criterion comparisons for this horizon.")
    async def inspect_trial_screening(params: ScreeningRequest) -> dict:
        return assessment

    return await run_agent(
        AgentRequest(
            task="Review potential trial matches and missing evidence", patient_id="TM-078", role="Oncologist"
        ),
        system_prompt=(
            "You support synthetic oncology trial screening. Call inspect_trial_screening, then render_ui "
            "with evidence and proposed checks. Cite the supplied protocol and record sources. "
            "Match means only that one criterion is supported, never confirmed eligibility. "
            "Keep conflicts and unknowns explicit; never recommend treatment or referral. "
            "Do not read other patients or use other sample data. All referral decisions belong to the oncologist."
        ),
        prompt=f"Review this {request.horizon} assessment: {json.dumps(assessment)}",
        extra_tools=[inspect_trial_screening],
        fallback_builder=lambda _request, note: demo_review(assessment, note),
    )


def demo_review(assessment: dict, note: str) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="Potential local match — renal function still needed",
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
                type="actions",
                title="For the oncologist to consider",
                body="Obtain current renal function; verify performance status "
                "and the full protocol with the trial team. "
                "No tests ordered, referrals sent or treatments recommended.",
            ),
        ],
    )
