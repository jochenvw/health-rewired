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
    case_id: Literal["neuropathy", "hair-loss", "nausea"] = "neuropathy"
    patient_id: Literal["SDM-104", "SDM-104-2", "SDM-104-3"] | None = None
    priorities: Priorities = Field(default_factory=Priorities)
    avoided_effects: list[Literal["hairLoss", "nausea", "handFoot"]] = Field(default_factory=list, max_length=3)


def consultation_data(params: Consultation) -> dict:
    data = sample_data.read("issue-104.json")
    country = next(item for item in data["countries"] if item["name"] == params.country)
    priority_case = next(
        item
        for item in data["priorityCases"]
        if (item["patientId"] == params.patient_id if params.patient_id else item["id"] == params.case_id)
    )
    patient_record = next(
        item for item in [data["patient"], *data["otherPatients"]] if item["id"] == priority_case["patientId"]
    )
    patient = f"{patient_record['name']} ({patient_record['id']}). " + patient_record["minimal"]
    if params.horizon == "future":
        patient += " " + patient_record["details"] + " " + priority_case["context"]
    weights = params.priorities.model_dump()
    top_weight = max(weights.values())
    comparable = [
        item
        for item in data["comparablePatients"]
        if priority_case["id"] == "neuropathy"
        and abs(item["age"] - patient_record["age"]) <= 5
        and item["stage"] == "III"
        and top_weight > 0
        and weights[item["priority"]] == top_weight
    ]
    return {
        "notice": data["notice"],
        "country": country,
        "patient": patient,
        "patient_identity": {key: patient_record[key] for key in ("id", "name", "age", "sex", "diagnosis")},
        "mdt": patient_record["mdt"],
        "priorities": weights,
        "avoided_effects": list(dict.fromkeys(params.avoided_effects)),
        "patient_characteristics": patient_record["characteristics"] if params.horizon == "future" else {},
        "priority_case": priority_case,
        "side_effect_reference": data["sideEffectReference"],
        "side_effects": data["sideEffects"],
        "evidence_status": {
            "guidelines_and_trials": "Guideline pointers unverified; no trial results retrieved.",
            "prediction_model": "No model connected. Displayed probabilities are teaching placeholders.",
            "observational_examples": "Synthetic only; selection bias and unequal follow-up. Not causal evidence.",
        },
        "comparable_patients": [
            {**item, "characteristics": data["comparableCharacteristics"][item["id"]]} for item in comparable
        ]
        if params.horizon == "future"
        else [],
        "options": [
            {
                "label": country["labels"][i],
                "plain": option["plain"],
                "benefit": option["benefit"],
                "burden": option["burden"],
                "trajectories": option["trajectories"] if params.horizon == "future" else {},
                "avoidance_fit": option["avoidanceFit"],
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
            "a clinical probability. Use the selected cancer side-effect priority_case labels and context. "
            "Use only the selected patient's identity and fixed characteristics. Do not substitute Eva for "
            "another patient or treat patient selection as editing one person's record. Shared outcome "
            "figures are teaching placeholders, not patient-specific predictions or MDT recommendations. "
            "The side_effect_reference supports topic selection only: regimen-specific advice and frequencies "
            "are unverified. Never infer hair-loss or nausea likelihoods or compare regimen toxicity from "
            "invented fit scores. Distinguish neuropathy from hand-foot syndrome. "
            "All provided trajectories are invented teaching samples, not measured incidence or validated "
            "predictions. Side-effect severity uses weeks; survival/recurrence uses years. Extra avoidance "
            "switches each add one preference point beyond ten slider points, not a medical contraindication. "
            "Comparable-case selection uses age, stage and top slider priorities only; extra avoidance "
            "concerns are not recorded in these cases. Explain matching, differing and unknown characteristics "
            "without claiming they are matched on every field. "
            "Case-specific fit scores are invented assumptions, not "
            "personalised medical predictions; clinical placeholder probabilities stay fixed. Discuss lack "
            "of matching records when comparable_patients is empty. Do not relabel neuropathy cohorts. Fit is not "
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
                    + f" Patient: {context['patient_identity']['name']} ({context['patient_identity']['id']}). "
                    + f"Discussion: {context['priority_case']['title']}. "
                    + "Your priorities (0–10): "
                    + ", ".join(
                        f"{context['priority_case']['labels'][key]} {value}"
                        for key, value in context["priorities"].items()
                    )
                    + ". "
                    + "Additional avoidance concerns: "
                    + ", ".join(
                        {"hairLoss": "Hair loss", "nausea": "Nausea and vomiting", "handFoot": "Hand–foot syndrome"}[
                            key
                        ]
                        for key in context["avoided_effects"]
                    )
                    + ("None. " if not context["avoided_effects"] else ". ")
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
                    UIItem(label="Ask together", detail=context["priority_case"]["context"]),
                    UIItem(
                        label=context["side_effect_reference"]["title"],
                        detail=context["side_effect_reference"]["limitation"]
                        + " Topic information only; not a source for invented risks or preference-fit scores.",
                        source=context["side_effect_reference"]["url"],
                    ),
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
