"""Post-MDT shared decisions, using synthetic teaching material only."""

import json
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent import run_agent
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/104", tags=["idea-104"])


class Consultation(BaseModel):
    country: Literal["Germany", "Italy", "Netherlands"] = "Germany"
    horizon: Literal["future", "six-months"] = "future"


def consultation_data(params: Consultation) -> dict:
    data = sample_data.read("issue-104.json")
    country = next(item for item in data["countries"] if item["name"] == params.country)
    patient = data["patient"]["minimal"]
    if params.horizon == "future":
        patient += " " + data["patient"]["details"]
    return {
        "notice": data["notice"],
        "country": country,
        "patient": patient,
        "options": [
            {
                "label": country["labels"][i],
                "plain": option["plain"],
                "benefit": option["benefit"],
                "burden": option["burden"],
            }
            for i, option in enumerate(data["options"])
        ],
        "terms": data["terms"],
    }


@define_tool(description="Read the synthetic colon cancer consultation and unverified guideline pointers.")
async def read_shared_decision_context(params: Consultation) -> dict:
    return consultation_data(params)


@router.post("/explain", response_model=AgentResult)
async def explain(params: Consultation) -> AgentResult:
    context = consultation_data(params)
    result = await run_agent(
        AgentRequest(task="Explain the post-MDT options in plain language.", role="Oncologist and patient"),
        system_prompt=(
            "You support a synthetic post-MDT consultation. Use read_shared_decision_context, then "
            "render_ui with summary and evidence blocks. Explain the two supplied options and "
            "adjuvant therapy in plain language. Never choose treatment or invent risk estimates, "
            "guideline passages or country-specific clinical differences. Full texts are not verified. "
            "Say summaries are synthetic, not guideline recommendations. Final choice is human."
        ),
        prompt=f"Consultation settings: {params.model_dump_json()}\nTeaching context: {json.dumps(context)}",
        extra_tools=[read_shared_decision_context],
    )
    if result.mode == "copilot":
        return result
    return AgentResult(
        mode="fallback",
        headline="Talking through the options together",
        note=f"{result.note} Using the issue-specific synthetic explanation; no live EHR or risk model.",
        trace=[TraceStep(tool="read_shared_decision_context")],
        blocks=[
            UIBlock(
                type="summary",
                title="What treatment after surgery means",
                body=context["terms"]["Adjuvant therapy"],
                items=[
                    UIItem(
                        label=option["label"],
                        detail=f"{option['plain']}. {option['burden']}",
                        source="sample-data/issue-104.json · synthetic summary",
                    )
                    for option in context["options"]
                ],
            ),
            UIBlock(
                type="evidence",
                title="What is known, and what needs checking",
                body="These are synthetic summaries, not verified country recommendations or personal predictions.",
                items=[
                    UIItem(
                        label=context["country"]["source"],
                        detail="Full text not retrieved or checked.",
                        source=context["country"]["url"],
                    ),
                    UIItem(label="Ask together", detail="How important are walking, daily tablets and fewer visits?"),
                ],
            ),
        ],
    )
