"""Agent elicitation for the tacit knowledge MDT walkthrough."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/98", tags=["idea-98"])

SYSTEM_PROMPT = """You are an oncology MDT assistant in a synthetic hackathon prototype.
The clinician's decision is theirs and is never judged or changed. Keep the exact clinician
statement separate from your tentative interpretation. Identify a possible missing decision
factor and explain why it may matter, while stating uncertainty. Use render_ui with evidence
and summary blocks. Do not turn one observation into a clinical rule or invent facts."""

HIDDEN_FACTORS = (
    "Operative physiological reserve",
    "Patient preference regarding a stoma",
    "Caregiving responsibilities affecting treatment preference",
    "Surgical technical feasibility",
    "Previous abdominal surgery",
)
FACTOR_EXPLANATIONS = {
    HIDDEN_FACTORS[0]: (
        "The clinician described poor cardiopulmonary reserve as a possible reason to avoid immediate major surgery."
    ),
    HIDDEN_FACTORS[1]: "The patient’s stated preference about a possible stoma may have influenced the pathway.",
    HIDDEN_FACTORS[2]: (
        "The patient’s caregiving responsibilities may have influenced the timing or acceptability of treatment."
    ),
    HIDDEN_FACTORS[3]: "A technical concern about resection may have influenced the treatment pathway.",
    HIDDEN_FACTORS[4]: "Previous abdominal surgery may have influenced the feasibility of the proposed operation.",
}
FACTOR_PHRASES = {
    "reserve": HIDDEN_FACTORS[0],
    "cardiopulmonary": HIDDEN_FACTORS[0],
    "heart": HIDDEN_FACTORS[0],
    "lung": HIDDEN_FACTORS[0],
    "stoma": HIDDEN_FACTORS[1],
    "caregiver": HIDDEN_FACTORS[2],
    "caring": HIDDEN_FACTORS[2],
    "husband": HIDDEN_FACTORS[2],
    "wife": HIDDEN_FACTORS[2],
    "technical": HIDDEN_FACTORS[3],
    "resect": HIDDEN_FACTORS[3],
    "previous abdominal": HIDDEN_FACTORS[4],
    "prior abdominal": HIDDEN_FACTORS[4],
}


class CaptureRequest(BaseModel):
    explanation: str = Field(min_length=6, max_length=1200)
    decision: Literal["Immediate surgery", "Systemic therapy first"] = "Systemic therapy first"


class CaptureResponse(BaseModel):
    mode: Literal["copilot", "fallback"]
    knowledge_item_id: str
    concept: str
    status: str
    confidence: str
    decision_type: str
    case_id: str
    hospital: str
    timestamp: str
    original_explanation: str
    interpretation: str
    created_by: str
    supporting_evidence: int
    evidence_timing: str
    review_history: list[str]
    result: AgentResult


def _concept_from_explanation(explanation: str) -> str:
    normalized = explanation.lower()
    return next(
        (concept for phrase, concept in FACTOR_PHRASES.items() if phrase in normalized),
        "Functional reserve not captured in the record",
    )


def _interpretation(result: AgentResult, concept: str) -> str:
    summary = next((block.body for block in result.blocks if block.type == "summary" and block.body), None)
    return summary or (
        f"Possible hidden factor: {concept}. This interpretation is a hypothesis "
        "based on one clinician explanation, not an established rule."
    )


def _demo_result(explanation: str, concept: str) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="Possible hidden decision factor",
        note=(
            "Deterministic demo mode: your original words are preserved separately from this tentative interpretation."
        ),
        blocks=[
            UIBlock(
                type="evidence",
                title="Candidate knowledge item · observed once",
                body="The following is a model interpretation, not an accepted clinical rule.",
                items=[
                    UIItem(label="Possible concept", detail=concept),
                    UIItem(
                        label="Model interpretation",
                        detail=FACTOR_EXPLANATIONS.get(
                            concept,
                            "The explanation may describe context not represented in the structured record.",
                        ),
                    ),
                    UIItem(label="Clinician’s exact words", detail=explanation),
                    UIItem(label="Source", detail="Treating clinician"),
                    UIItem(label="Capture method", detail="Agent elicitation"),
                    UIItem(label="Status", detail="Hypothesised · one decision episode"),
                    UIItem(label="Confidence", detail="Low"),
                ],
            )
        ],
        trace=[],
    )


@router.post("/capture", response_model=CaptureResponse)
async def capture_explanation(request: CaptureRequest) -> CaptureResponse:
    concept = _concept_from_explanation(request.explanation)
    comparables = _compare_with_history(_generate_episodes(1200), request.decision)["cases"][:3]
    comparison_context = "\n".join(
        f"{case['episode_id']}: {case['decision']}, {case['similarity']}% context match; "
        f"matched {', '.join(case['matched_factors'])}."
        for case in comparables
    )
    task = (
        "Interpret this post-decision explanation as a possible missing factor. The current case "
        f"is a synthetic stage III colorectal cancer decision: the clinician selected {request.decision}. "
        "Here are three retrieved comparable cases, selected by deterministic "
        "weighted structured similarity; these summaries exclude post-decision notes:\n"
        f"{comparison_context}\n\n"
        "Keep the exact statement distinct from your interpretation. "
        "Give one possible concept, why it may matter, and uncertainty. This is one observation "
        "only, not a clinical rule. Do not judge or change the choice, and do not invent facts.\n\n"
        f"Clinician explanation: {request.explanation}"
    )
    result = await run_agent(
        AgentRequest(task=task, role="Tumour board clinician"),
        system_prompt=SYSTEM_PROMPT,
    )
    if result.mode == "fallback":
        result = _demo_result(request.explanation, concept)
    return CaptureResponse(
        mode=result.mode,
        knowledge_item_id="TK-CRC-242-v1",
        concept=concept,
        status="Hypothesised",
        confidence="Low",
        decision_type="Immediate surgery vs systemic therapy first",
        case_id="MDT-242",
        hospital="Klinikum Rewired München",
        timestamp=datetime.now(UTC).isoformat(),
        original_explanation=request.explanation,
        interpretation=_interpretation(result, concept),
        created_by="Treating clinician · agent elicitation",
        supporting_evidence=1,
        evidence_timing="Recorded after the decision; not used to assess the original decision.",
        review_history=["Created from one clinician explanation; no rule or field approved."],
        result=result,
    )


@router.get("/analysis")
async def decision_analysis(
    size: Annotated[int, Query(ge=200, le=10000)] = 1200,
    validated_concepts: Annotated[list[str] | None, Query()] = None,
    current_decision: Literal["Immediate surgery", "Systemic therapy first"] = "Systemic therapy first",
) -> dict:
    episodes = _generate_episodes(size)
    comparison = _compare_with_history(episodes, current_decision)
    factors = _factor_clusters(episodes, validated_concepts or [])
    total = len(episodes)
    post_decision_notes = sum(episode["post_decision_explanation"] is not None for episode in episodes)
    unresolved = sum(
        episode["decision"] != "Immediate surgery" and episode["post_decision_explanation"] is None
        for episode in episodes
    )
    validated_support = sum(
        factor["unexplained_relevant_count"] for factor in factors if factor["status"] == "Clinician validated"
    )
    after_unresolved = max(0, unresolved - validated_support)
    return {
        "synthetic": True,
        "size": total,
        "comparison": comparison,
        "metrics": {
            "episodes_analysed": total,
            "comparable_episodes": len(comparison["cases"]),
            "decisions_with_post_decision_context": post_decision_notes,
            "potentially_missing_context": unresolved,
            "unexplained_rate": round(unresolved / total * 100, 1),
            "unexplained_after_validated_factors": after_unresolved,
            "unexplained_rate_after_validated_factors": round(after_unresolved / total * 100, 1),
            "recurring_candidate_factors": sum(factor["observation_count"] > 1 for factor in factors),
            "validated_factors": sum(factor["status"] == "Clinician validated" for factor in factors),
            "cases_affected_by_validated_factors": validated_support,
        },
        "factors": factors,
        "analysis_note": (
            "Counts are computed from generated synthetic decision episodes. Similarity uses "
            "weighted structured context only; clinician explanations were recorded after the "
            "decision and are excluded from the original comparison."
        ),
    }


def _generate_episodes(size: int) -> list[dict]:
    profiles = [
        {"stage": "III", "location": "sigmoid", "age": 68, "comorbidity": "none", "performance_status": "1"},
        {"stage": "III", "location": "sigmoid", "age": 72, "comorbidity": "hypertension", "performance_status": "1"},
        {
            "stage": "III",
            "location": "rectum",
            "age": 65,
            "comorbidity": "cardiopulmonary disease",
            "performance_status": "1",
        },
        {"stage": "II", "location": "ascending colon", "age": 70, "comorbidity": "none", "performance_status": "0"},
        {
            "stage": "III",
            "location": "descending colon",
            "age": 74,
            "comorbidity": "diabetes",
            "performance_status": "2",
        },
        {
            "stage": "III",
            "location": "rectum",
            "age": 61,
            "comorbidity": "previous abdominal surgery",
            "performance_status": "1",
        },
        {"stage": "II", "location": "sigmoid", "age": 57, "comorbidity": "hypertension", "performance_status": "0"},
        {
            "stage": "III",
            "location": "ascending colon",
            "age": 77,
            "comorbidity": "cardiopulmonary disease",
            "performance_status": "2",
        },
        {"stage": "III", "location": "rectum", "age": 69, "comorbidity": "none", "performance_status": "1"},
        {
            "stage": "II",
            "location": "descending colon",
            "age": 64,
            "comorbidity": "diabetes",
            "performance_status": "1",
        },
    ]
    remarks = (
        "Clinician noted limited cardiopulmonary reserve when discussing major surgery.",
        "The patient said avoiding a permanent stoma was important to them.",
        "The patient is the primary carer for a partner and declined a prolonged recovery.",
        "The surgeon documented a technical concern about obtaining a clear margin.",
        "Prior abdominal surgery may make the proposed operation more difficult.",
    )
    hospitals = ("Munich Central", "Isar Oncology Centre", "Weststadt Hospital", "Riverside Clinic")
    start = datetime(2025, 1, 1, tzinfo=UTC)
    episodes = []
    for index in range(size):
        profile_index = index % len(profiles)
        repeat = index // len(profiles)
        profile = profiles[profile_index]
        divergent = repeat % 10 in {7, 8, 9}
        factor_index = profile_index % len(HIDDEN_FACTORS)
        explanation = remarks[factor_index] if divergent and repeat % 10 in {7, 8} else None
        timestamp = start + timedelta(days=index)
        episodes.append(
            {
                "episode_id": f"MDT-SYN-{index + 1:05d}",
                "hospital": hospitals[profile_index % len(hospitals)],
                "timestamp": timestamp.date().isoformat(),
                "decision_type": "Colorectal cancer surgery pathway",
                "decision": "Systemic therapy first" if divergent else "Immediate surgery",
                "diagnosis": "Colorectal adenocarcinoma",
                **{**profile, "age": profile["age"] + repeat % 8},
                "histology": "Adenocarcinoma",
                "biomarkers": "MMR proficient",
                "previous_treatment": "None",
                "evidence_available_at_decision": [
                    "Diagnosis",
                    "Stage",
                    "Histology",
                    "Tumour location",
                    "Comorbidity",
                    "Performance status",
                    "Previous treatment",
                ],
                "post_decision_explanation": explanation,
                "latent_factor": HIDDEN_FACTORS[factor_index],
                "explanation_available_at_decision": False,
            }
        )
    return episodes


def _context_similarity(current: dict, historical: dict) -> tuple[int, list[str]]:
    weights = {
        "diagnosis": 18,
        "stage": 18,
        "histology": 15,
        "location": 14,
        "comorbidity": 14,
        "performance_status": 12,
        "previous_treatment": 5,
        "biomarkers": 4,
    }
    score = 0
    matched = []
    for field, weight in weights.items():
        if current[field] == historical[field]:
            score += weight
            matched.append(field.replace("_", " "))
    age_difference = abs(current["age"] - historical["age"])
    score += max(0, 10 - age_difference)
    return round(score * 100 / 110), matched


def _compare_with_history(episodes: list[dict], current_decision: str = "Systemic therapy first") -> dict:
    current = {
        "episode_id": "MDT-CURRENT-242",
        "diagnosis": "Colorectal adenocarcinoma",
        "stage": "III",
        "histology": "Adenocarcinoma",
        "location": "sigmoid",
        "age": 69,
        "comorbidity": "none",
        "performance_status": "1",
        "previous_treatment": "None",
        "biomarkers": "MMR proficient",
        "decision": current_decision,
    }
    eligible = [
        (episode, _context_similarity(current, episode))
        for episode in episodes
        if episode["decision"] != current_decision
    ]
    ranked = sorted(eligible, key=lambda item: item[1][0], reverse=True)[:5]
    cases = [
        {
            "episode_id": episode["episode_id"],
            "hospital": episode["hospital"],
            "timestamp": episode["timestamp"],
            "decision": episode["decision"],
            "similarity": score,
            "matched_factors": matched,
            "minor_differences": (
                [f"age: {current['age']} vs {episode['age']}"] if current["age"] != episode["age"] else []
            ),
            "missing_context": ["Operative physiological reserve", "Patient preference", "Technical operability"],
            "evidence_available_at_decision": episode["evidence_available_at_decision"],
        }
        for episode, (score, matched) in ranked
    ]
    return {
        "current_episode": current,
        "similarity_method": (
            "Transparent weighted comparison: diagnosis, stage, histology, location, "
            "comorbidity and performance status weigh more than age."
        ),
        "cases": cases,
    }


def _factor_clusters(episodes: list[dict], validated_concepts: list[str]) -> list[dict]:
    factors = []
    for concept in HIDDEN_FACTORS:
        related = [episode for episode in episodes if episode["latent_factor"] == concept]
        supporting = [episode for episode in related if episode["post_decision_explanation"]]
        counterexamples = [episode for episode in related if episode["decision"] == "Immediate surgery"]
        unexplained_relevant = [
            episode
            for episode in related
            if episode["decision"] != "Immediate surgery" and episode["post_decision_explanation"] is None
        ]
        observation_count = len(supporting)
        status = (
            "Clinician validated"
            if concept in validated_concepts
            else "Corroborated"
            if observation_count >= 12
            else "Repeated"
            if observation_count > 1
            else "Hypothesised"
        )
        factors.append(
            {
                "concept": concept,
                "decision_type": "Immediate surgery vs systemic therapy first",
                "observation_count": observation_count,
                "supporting_count": len(supporting),
                "counterexample_count": len(counterexamples),
                "unexplained_relevant_count": len(unexplained_relevant),
                "confidence": "High" if observation_count >= 12 else "Medium" if observation_count > 1 else "Low",
                "status": status,
                "representation": "Candidate structured field; not encoded",
                "examples": [
                    {
                        "episode_id": episode["episode_id"],
                        "hospital": episode["hospital"],
                        "decision": episode["decision"],
                        "clinician_explanation": episode["post_decision_explanation"],
                        "available_at_decision": episode["explanation_available_at_decision"],
                    }
                    for episode in supporting[:3]
                ],
                "counterexamples": [
                    {
                        "episode_id": episode["episode_id"],
                        "hospital": episode["hospital"],
                        "decision": episode["decision"],
                        "note": "Same broad synthetic context; this pathway remained surgery.",
                    }
                    for episode in counterexamples[:3]
                ],
                "review_history": [
                    {"status": "Hypothesised", "detail": "Pattern generated from synthetic episode notes."},
                    {
                        "status": status,
                        "detail": "Status reflects generated evidence; human validation is not implied.",
                    },
                ],
            }
        )
    return sorted(factors, key=lambda factor: factor["observation_count"], reverse=True)
