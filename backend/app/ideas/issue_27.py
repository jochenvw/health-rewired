"""Issue #27 — cohort explorer: real-world eligibility, outcomes and simulated follow-up.

Researchers manually assemble records and reconcile trial eligibility across hospitals to answer
"what happened to patients who did/didn't meet trial criteria" — with no traceable, repeatable way
to revisit the question as new data arrives. This module gives a researcher a clickable loop: pick
a treatment/trial, subgroup and outcome; the agent proposes explicit cohort rules for approval,
classifies every synthetic patient as eligible/ineligible/unknown with a source record, and can
rerun after simulated follow-up data to show whether the finding still holds.

The eligibility/outcome engine (``issue_27_cohort.py``) is deterministic and rule-based on purpose:
reproducible, traceable, and it never claims an observed difference proves a treatment effect.
"""

import json

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem
from app.config import settings
from app.ideas import issue_27_cohort as cohort

router = APIRouter(prefix="/api/ideas/27")


class CohortRequest(BaseModel):
    trial_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,32}$")
    treatment: str = Field(default="", max_length=200)
    subgroup: str = Field(default="", max_length=200)
    outcome: str = Field(default="lab trend", max_length=200)
    role: str | None = Field(default=None, max_length=80)
    simulate: bool = False


# ---- tools the agent can call for this idea (not shared with the starter agent) -----------------


class CohortQuestionParams(BaseModel):
    trial_id: str = Field(description="Synthetic trial id from trials.csv, e.g. 'SYN-LU-310'")
    outcome: str = Field(description="Outcome to describe, e.g. 'lab trend', 'imaging', 'patient-reported symptoms'")


class BuildCohortParams(CohortQuestionParams):
    treatment: str = Field(description="Treatment named by the researcher, e.g. 'osimertinib'")
    subgroup: str = Field(description="Patient subgroup named by the researcher, e.g. 'EGFR-mutant NSCLC'")


class SimulateFollowupParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id to generate one fictional follow-up record for")


@define_tool(
    description=(
        "Propose explicit, human-readable cohort rules (treatment/trial, subgroup, outcome window) for a "
        "researcher to approve before building a real-world cohort. Does not classify any patient yet."
    ),
    skip_permission=True,
)
def propose_cohort_rules(params: CohortQuestionParams) -> str:
    try:
        rules, trial = cohort.propose_rules(params.trial_id, params.outcome)
    except KeyError:
        return json.dumps({"error": "unknown trial_id", "known": [t["trial_id"] for t in cohort.list_trials()]})
    return json.dumps({"rules": rules, "trial": trial})


@define_tool(
    description=(
        "Build and classify a synthetic real-world cohort for an approved treatment/subgroup/outcome question: "
        "every patient becomes eligible, ineligible or unknown against the trial's structured criteria, each "
        "with reasons and a source record, plus a short descriptive (non-causal) outcome per patient."
    ),
    skip_permission=True,
)
def build_cohort(params: BuildCohortParams) -> str:
    try:
        result = cohort.build_cohort(params.trial_id, params.treatment, params.subgroup, params.outcome)
    except KeyError:
        return json.dumps({"error": "unknown trial_id", "known": [t["trial_id"] for t in cohort.list_trials()]})
    return json.dumps(
        {
            "trial_id": result.trial_id,
            "trial_title": result.trial_title,
            "rules": result.rules,
            "counts": result.counts,
            "caveat": result.caveat,
            "patients": [
                {
                    "patient_id": p.patient_id,
                    "name": p.name,
                    "status": p.status,
                    "reasons": p.reasons,
                    "outcome_summary": p.outcome_summary,
                    "outcome_missing": p.outcome_missing,
                    "source": p.source,
                }
                for p in result.patients
            ],
        }
    )


@define_tool(
    description=(
        "Add one fictional follow-up lab record for a patient (in-memory only, never written to /sample-data) "
        "so the cohort question can be rerun to see whether the finding still holds."
    ),
    skip_permission=True,
)
def simulate_followup(params: SimulateFollowupParams) -> str:
    try:
        return json.dumps(cohort.simulate_followup(params.patient_id))
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient", "known": sample_data.list_patients()})


COHORT_TOOLS = [propose_cohort_rules, build_cohort, simulate_followup]


# ---- prompt ---------------------------------------------------------------------------------

COHORT_SYSTEM_PROMPT = """\
You are the cohort-explorer agent for the Oncology Hackathon 2026 Munich (issue #27).
A researcher asks what actually happened to patients who did or didn't meet a synthetic trial's
criteria. All data is SYNTHETIC (from /sample-data). Never ask for or invent real patient data.

Rules:
- Call `propose_cohort_rules` first, put the returned rules in an `actions` block for the
  researcher to approve, then call `build_cohort` and show its classification in a `cohort` block
  (one item per patient; set the item's `status` field to eligible/ineligible/unknown; detail =
  reasons; source = the record; severity 'warning' for 'unknown').
- Never claim an observed difference proves a treatment effect - repeat the caveat.
- If simulated follow-up is requested, also call `simulate_followup` per patient and explain what
  changed (or did not) in an `evidence` or `alert` block for human review.
- Surface missing/unknown data and anything needing human review as an `alert` block.
- Finish by calling `render_ui` exactly once.
"""


def _build_prompt(body: CohortRequest) -> str:
    parts = [
        "Task: Define, build and explain a synthetic real-world cohort for this question.",
        f"Cohort question — trial: {body.trial_id}, treatment: {body.treatment}, "
        f"subgroup: {body.subgroup}, outcome: {body.outcome}",
    ]
    if body.role:
        parts.append(f"User role: {body.role}")
    if body.simulate:
        parts.append(
            "Also call simulate_followup for each patient with matching outcome data, rebuild the classification "
            "and explain what changed since the approved question was first answered."
        )
    return "\n".join(parts)


# ---- deterministic fallback (used when the Copilot SDK is not configured) --------------------


def _cohort_block(result: cohort.CohortResult) -> UIBlock:
    counts = result.counts
    items = [
        UIItem(
            label=f"{p.patient_id} · {p.name} · {p.status.upper()}",
            detail="; ".join(p.reasons),
            source=p.source,
            severity="warning" if p.status == "unknown" else None,
            status=p.status,
        )
        for p in result.patients
    ]
    return UIBlock(
        type="cohort",
        title=f"Cohort for {result.trial_id}",
        body=(f"Eligible: {counts['eligible']} · Ineligible: {counts['ineligible']} · Unknown: {counts['unknown']}"),
        items=items,
    )


def _build_cohort_fallback(body: CohortRequest, note: str) -> AgentResult:
    """Deterministic cohort-explorer view: rules → classification → outcomes → review queue."""
    trace = [TraceStep(tool="propose_cohort_rules", arguments=body.trial_id)]
    try:
        result = cohort.build_cohort(body.trial_id, body.treatment, body.subgroup, body.outcome)
    except KeyError:
        known = ", ".join(t["trial_id"] for t in cohort.list_trials())
        return AgentResult(
            mode="fallback",
            headline="Unknown trial",
            blocks=[UIBlock(type="alert", title="Unknown trial id", body=f"Known trials: {known}")],
            trace=trace,
            note=note,
        )
    trace.append(TraceStep(tool="build_cohort", arguments=body.trial_id))

    blocks = [
        UIBlock(
            type="actions",
            title="Proposed cohort rules (approve before reviewing results)",
            items=[
                UIItem(label=rule, detail="Proposed from the trial's criteria; edit or approve")
                for rule in result.rules
            ],
        ),
        _cohort_block(result),
        UIBlock(
            type="evidence",
            title="What happened (descriptive, not causal)",
            body=result.caveat,
            items=[
                UIItem(label=f"{p.patient_id} · {p.name}", detail=p.outcome_summary, source=p.source)
                for p in result.patients
            ],
        ),
    ]
    missing = [p for p in result.patients if p.outcome_missing]
    unknowns = [p for p in result.patients if p.status == "unknown"]
    review_items = [
        UIItem(label=f"Confirm eligibility for {p.patient_id}: {p.reasons[0]}", severity="warning") for p in unknowns
    ] + [UIItem(label=f"Missing outcome data for {p.patient_id}", severity="warning") for p in missing]
    if review_items:
        blocks.append(UIBlock(type="alert", title="Needs human review", severity="warning", items=review_items))

    if body.simulate:
        simulated_labs = {p.patient_id: cohort.simulate_followup(p.patient_id) for p in result.patients}
        trace.append(TraceStep(tool="simulate_followup", arguments="all patients"))
        simulated_result = cohort.build_cohort(
            body.trial_id,
            body.treatment,
            body.subgroup,
            body.outcome,
            simulated={pid: {"labs": data["labs"]} for pid, data in simulated_labs.items()},
        )
        diff = cohort.build_simulated_diff(result, simulated_result)
        blocks.append(
            UIBlock(
                type="evidence",
                title="What changed after simulated follow-up",
                body="Fictional follow-up records only, never written to /sample-data.",
                items=[UIItem(label=line) for line in diff],
            )
        )

    blocks.append(
        UIBlock(
            type="actions",
            title="Review queue",
            items=[UIItem(label="Investigate the flagged patients above")]
            if review_items
            else [UIItem(label="No open flags — approve and close the loop, or return after new data arrives")],
        )
    )

    return AgentResult(
        mode="fallback",
        headline=f"Cohort for {result.trial_id}: {result.trial_title} (deterministic demo)",
        blocks=blocks,
        trace=trace,
        note=note,
    )


# ---- routes -----------------------------------------------------------------------------------


@router.get("/trials")
async def trials() -> list[dict]:
    """Synthetic trials, including the structured eligibility columns the cohort engine uses."""
    return cohort.list_trials()


@router.post("/run")
async def run(body: CohortRequest) -> AgentResult:
    if settings.copilot_auth_mode == "not-configured":
        return _build_cohort_fallback(body, "Copilot SDK not configured: set COPILOT_GITHUB_TOKEN.")
    request = AgentRequest(
        task="Define, build and explain a synthetic real-world cohort for this question.", role=body.role
    )
    return await run_agent(
        request,
        system_prompt=COHORT_SYSTEM_PROMPT,
        prompt=_build_prompt(body),
        extra_tools=COHORT_TOOLS,
    )
