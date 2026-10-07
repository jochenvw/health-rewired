"""Targeted, source-grounded review skill for the synthetic MDT cases."""

import json
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.ui import inline_schema

router = APIRouter(prefix="/api/ideas/74", tags=["idea-74"])


class ReviewSource(BaseModel):
    title: str = Field(max_length=160)
    hospital: str = Field(max_length=160)
    date: str = Field(max_length=40)
    excerpt: str = Field(max_length=1000)
    value: str | None = Field(default=None, max_length=300)


class ReviewCandidate(BaseModel):
    key: str = Field(pattern=r"^evidence-[0-9a-f]{1,16}$")
    label: str = Field(max_length=160)
    statement: str = Field(max_length=1000)
    state: Literal["corroborated", "single-source", "unverified", "contradictory", "missing"]
    sources: list[ReviewSource] = Field(max_length=4)


class EvidenceReviewRequest(BaseModel):
    patient_id: str = Field(pattern=r"^P-[0-9]{3}$")
    assertions: list[ReviewCandidate] = Field(min_length=1, max_length=8)


class ReviewProposal(BaseModel):
    assertion_key: str = Field(pattern=r"^evidence-[0-9a-f]{1,16}$")
    outcome: Literal[
        "verified",
        "gap-reviewed",
        "unverified-reviewed",
        "accepted-a",
        "accepted-b",
        "unresolved",
        "investigation",
    ]
    rationale: str = Field(min_length=3, max_length=600)
    source_index: int | None = Field(default=None, ge=0, le=3)


class ReviewProposalParams(BaseModel):
    proposals: list[ReviewProposal] = Field(min_length=1, max_length=8)


class EvidenceReviewResponse(BaseModel):
    result: AgentResult
    proposals: list[ReviewProposal] = Field(default_factory=list)


SYSTEM_PROMPT = """You are the evidence-review skill in a synthetic colorectal MDT preparation workspace.
Check the supplied Patient-at-a-glance assertions against the synthetic patient's record and the
linked source passages. Do not invent, infer, or fill missing facts. Treat generated statements
without an exact source passage as unverified. Compare both passages for contradictions; you may
suggest Evidence A or B only when its cited passage directly supports the claim. Otherwise leave
the conflict unresolved.

For every supplied assertion, call submit_evidence_review with a source-grounded proposal:
- verified only for a present claim directly supported by its cited source;
- gap-reviewed for a missing claim, explicitly keeping it missing;
- unverified-reviewed when no exact supporting passage is attached;
- accepted-a / accepted-b only as a suggested conflict reconciliation with the matching source_index;
- unresolved or investigation when the evidence does not support a safe suggestion.
Include a concise rationale naming the source or explaining the remaining uncertainty. These are
proposals only. Never write a review, update a source, or make a clinical decision. Finish by calling
render_ui with a short explanation that a clinician must confirm every proposal."""


def _build_proposal_tool(candidates: list[ReviewCandidate], captured: dict[str, ReviewProposal]):
    candidate_by_key = {candidate.key: candidate for candidate in candidates}

    def submit_evidence_review(params: ReviewProposalParams) -> str:
        accepted = 0
        rejected: list[str] = []
        for proposal in params.proposals:
            candidate = candidate_by_key.get(proposal.assertion_key)
            if candidate is None:
                rejected.append("Unknown assertion")
                continue
            state = candidate.state
            allowed = (
                {"verified"}
                if state in {"corroborated", "single-source"} and candidate.sources
                else {"gap-reviewed"}
                if state == "missing"
                else {"unverified-reviewed"}
                if state == "unverified"
                else {"accepted-a", "accepted-b", "unresolved", "investigation"}
                if state == "contradictory" and len(candidate.sources) >= 2
                else set()
            )
            if proposal.outcome not in allowed:
                rejected.append(f"Review type does not match {candidate.label}")
                continue
            if proposal.outcome in {"accepted-a", "accepted-b"}:
                expected_index = 0 if proposal.outcome == "accepted-a" else 1
                if proposal.source_index != expected_index:
                    rejected.append(f"Source selection does not match {candidate.label}")
                    continue
            elif proposal.source_index is not None:
                rejected.append(f"Unexpected source selection for {candidate.label}")
                continue
            captured[proposal.assertion_key] = proposal
            accepted += 1
        return json.dumps(
            {
                "proposals_recorded": accepted,
                "rejected": rejected,
                "notice": "Proposals are not applied; a clinician must confirm them.",
            }
        )

    tool = define_tool(
        "submit_evidence_review",
        description=(
            "Return source-grounded review proposals for supplied assertions. "
            "This never changes a review or patient record."
        ),
        handler=submit_evidence_review,
        params_type=ReviewProposalParams,
        skip_permission=True,
    )
    tool.parameters = inline_schema(dict(tool.parameters or {}))
    return tool


@router.post("/evidence-review", response_model=EvidenceReviewResponse)
async def review_patient_evidence(request: EvidenceReviewRequest) -> EvidenceReviewResponse:
    try:
        patient = sample_data.get_patient(request.patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Synthetic patient record not found") from exc
    if patient.get("synthetic") is not True:
        raise HTTPException(status_code=400, detail="Evidence review accepts synthetic records only")

    captured: dict[str, ReviewProposal] = {}
    prompt = (
        f"Review the following selected summary assertions for synthetic patient {request.patient_id}.\n"
        "Assertions and linked source passages:\n"
        f"{json.dumps([item.model_dump() for item in request.assertions], ensure_ascii=False)}\n"
        "Use get_patient to check the patient record, then submit one proposal per assertion."
    )
    result = await run_agent(
        AgentRequest(
            task=f"Review the Patient-at-a-glance evidence for synthetic patient {request.patient_id}.",
            patient_id=request.patient_id,
            role="MDT evidence reviewer",
        ),
        system_prompt=SYSTEM_PROMPT,
        prompt=prompt,
        extra_tools=[_build_proposal_tool(request.assertions, captured)],
    )

    proposals = list(captured.values())
    if result.mode == "fallback":
        proposals = [_demo_proposal(candidate) for candidate in request.assertions]
    return EvidenceReviewResponse(result=result, proposals=proposals)


def _demo_proposal(candidate: ReviewCandidate) -> ReviewProposal:
    if candidate.state == "missing":
        outcome = "gap-reviewed"
        rationale = "Deterministic demo: no source passage is present; this remains a gap for clinician review."
    elif candidate.state == "unverified":
        outcome = "unverified-reviewed"
        rationale = "Deterministic demo: no exact source passage is attached; this statement remains unverified."
    elif candidate.state == "contradictory":
        outcome = "unresolved"
        rationale = "Deterministic demo: the supplied sources disagree; neither source is selected."
    elif candidate.sources:
        outcome = "verified"
        rationale = (
            "Deterministic demo matched this assertion to the supplied synthetic source: "
            f"{candidate.sources[0].title}. Clinician confirmation is still required."
        )
    else:
        outcome = "unverified-reviewed"
        rationale = "Deterministic demo found no linked source passage; this statement remains unverified."
    return ReviewProposal(assertion_key=candidate.key, outcome=outcome, rationale=rationale)
