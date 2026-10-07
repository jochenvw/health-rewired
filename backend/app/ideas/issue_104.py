"""Post-MDT shared decisions, using synthetic teaching material only."""

import json
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import run_agent
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/104", tags=["idea-104"])


class Priorities(BaseModel):
    quality: int = Field(default=5, ge=0, le=10)
    survivalFit: int = Field(default=5, ge=0, le=10)
    mobility: int = Field(default=5, ge=0, le=10)


class Consultation(BaseModel):
    country: Literal["Germany", "Italy", "Netherlands"] = "Germany"
    horizon: Literal["future", "six-months"] = "future"
    priorities: Priorities = Field(default_factory=Priorities)


def consultation_data(params: Consultation) -> dict:
    data = sample_data.read("issue-104.json")
    country = next(item for item in data["countries"] if item["name"] == params.country)
    patient = data["patient"]["minimal"]
    if params.horizon == "future":
        patient += " " + data["patient"]["details"]
    weights = params.priorities.model_dump()
    top_weight = max(weights.values())
    comparable = [
        item
        for item in data["comparablePatients"]
        if abs(item["age"] - data["patient"]["age"]) <= 5
        and item["stage"] == "III"
        and top_weight > 0
        and weights[item["priority"]] == top_weight
    ]
    return {
        "notice": data["notice"],
        "country": country,
        "patient": patient,
        "priorities": weights,
        "evidence_status": {
            "guidelines_and_trials": "Guideline pointers unverified; no trial results retrieved.",
            "prediction_model": "No model connected. Displayed probabilities are teaching placeholders.",
            "observational_examples": "Synthetic only; selection bias and unequal follow-up. Not causal evidence.",
        },
        "comparable_patients": comparable if params.horizon == "future" else [],
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
            "render_ui with summary and evidence blocks. Explain the three supplied options, including "
            "no additional chemotherapy with follow-up (not abandonment of care), and "
            "adjuvant therapy in plain language. Never choose treatment or invent risk estimates, "
            "guideline passages or country-specific clinical differences. Full texts are not verified. "
            "Separate patient values from guideline/trial evidence, unconnected prediction models and "
            "synthetic observational examples. Discuss the provided priorities without treating fit as "
            "a clinical probability. Comparable cases are not causal evidence. Do not suggest a learning "
            "loop has transmitted data or trained a model. Say summaries are synthetic, not guideline "
            "recommendations. Final choice is human."
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
                body=(
                    context["terms"]["Adjuvant therapy"]
                    + " No additional chemotherapy remains a choice to discuss, with follow-up and supportive care."
                    + f" Your priorities (0–10): quality of life {params.priorities.quality}, "
                    + f"survival benefit {params.priorities.survivalFit}, walking {params.priorities.mobility}. "
                    + "Preferences change fit, not clinical risk estimates. The joint decision remains yours."
                ),
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
                    UIItem(label="Prediction model", detail=context["evidence_status"]["prediction_model"]),
                    UIItem(
                        label="Patients like me",
                        detail=(
                            f"{len(context['comparable_patients'])} matching synthetic examples; not causal evidence."
                            if params.horizon == "future"
                            else "Unavailable in six months; needs linked outcomes and recorded patient values."
                        ),
                    ),
                ],
            ),
        ],
    )
