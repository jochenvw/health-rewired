"""Idea: AI European Tumour Board – pre-board analysis (issue #34).

Convenes six specialist AI personas (oncologist, radiologist, pathologist, molecular specialist,
trial specialist, real-world-evidence specialist) over one synthetic complex case. They must state
their own hypothesis, challenge each other's assumptions directly, and converge into a consensus
board that separates what is agreed, what is still disputed, what is missing before the meeting,
and what stays a human decision – the board still owns the actual decision.
"""

import json

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.ui import ChallengeView, SpecialistView, UIBlock, UIItem
from app.config import settings

router = APIRouter(prefix="/api/ideas/34")

SPECIALIST_ROLES = [
    "Oncologist",
    "Radiologist",
    "Pathologist",
    "Molecular specialist",
    "Trial specialist",
    "Real-world-evidence specialist",
]

SYSTEM_PROMPT = f"""\
You are the AI pre-board coordinator for a European tumour board. All data is SYNTHETIC (from
/sample-data). Never invent or assume real patient data; use tools to gather every fact and cite
the file it came from as `source`.

Convene exactly six specialist personas, each with their own initial hypothesis, the evidence it
rests on, and a confidence level (low/medium/high):
- {SPECIALIST_ROLES[0]}: the overall diagnostic/treatment hypothesis and plan.
- {SPECIALIST_ROLES[1]}: what imaging shows, and does not show.
- {SPECIALIST_ROLES[2]}: histology, grade, receptor/IHC results – confirmed vs. still pending.
- {SPECIALIST_ROLES[3]}: biomarkers, mutations, outstanding testing.
- {SPECIALIST_ROLES[4]}: matching trials (trials.csv) and their eligibility criteria.
- {SPECIALIST_ROLES[5]}: comparable synthetic patients (call find_similar_patients) and what they imply.

Then run a challenge round: at least two specialists must directly challenge another specialist's
hypothesis where the evidence conflicts (for example the molecular specialist challenging the
oncologist's plan because a pending result could change it, or the trial specialist challenging the
oncologist because a toxicity would exclude a matching trial). Never smooth conflicts into one
summary – name who challenges whom, the exact evidence contested, and whether it is resolved.

Finish by calling `render_ui` exactly once with ONE block of type `specialist_debate`:
- `specialists`: exactly six entries, one per role above, each with `hypothesis`, `evidence`,
  `confidence` and a `source`.
- `challenges`: the challenge round, each with `challenger`, `challenged`, `contested_evidence`,
  `detail`, `resolved`.
- `items`: the consensus board. Every item needs `group` set to one of:
  - "agreed": where the specialists converge.
  - "disputed": disagreements that remain unresolved.
  - "missing": evidence needed before the tumour board meets.
  - "human_decision": the diagnostic/treatment choices the board itself must make – framed as
    open decisions, never as a decision already taken.
Keep every field short and clinical.
"""


class SimilarPatientsParams(BaseModel):
    cancer_keyword: str = Field(description="Keyword from the primary diagnosis to match, e.g. 'breast', 'lung'")
    exclude_patient_id: str | None = Field(default=None, description="Patient id to exclude from the results")


@define_tool(
    description=(
        "Find other synthetic patients whose primary diagnosis matches a cancer keyword, to compare "
        "as real-world-evidence for the current case."
    ),
    skip_permission=True,
)
def find_similar_patients(params: SimilarPatientsParams) -> str:
    return json.dumps(similar_patients(params.cancer_keyword, params.exclude_patient_id))


def similar_patients(cancer_keyword: str, exclude_patient_id: str | None = None) -> list[dict]:
    keyword = cancer_keyword.strip().lower()
    return [
        p
        for p in sample_data.list_patients()
        if keyword and keyword in (p.get("diagnosis") or "").lower() and p.get("id") != exclude_patient_id
    ]


def _prompt(patient_id: str) -> str:
    return (
        f"Prepare an AI pre-board analysis for patient {patient_id} ahead of tomorrow's tumour board. "
        "Gather the patient record, any MDT note, the trial list and comparable synthetic patients, "
        "then convene the six-specialist debate as instructed and call render_ui."
    )


def _deterministic_debate(patient_id: str) -> AgentResult:
    """Fixed six-specialist debate for the default complex case, used without a Copilot token."""
    record = sample_data.get_patient(patient_id)
    source = f"patients/{patient_id}.json"
    guideline = "notes/guideline-breast-her2-ihc2plus.md"
    trials = "trials.csv"

    specialists = [
        SpecialistView(
            role="Oncologist",
            hypothesis="Continue EC → weekly paclitaxel; add anti-HER2 therapy only if ISH confirms amplification.",
            evidence="Guideline-concordant neoadjuvant backbone started before ISH result, per protocol.",
            confidence="medium",
            source=source,
        ),
        SpecialistView(
            role="Radiologist",
            hypothesis="No distant disease documented; response not yet reassessed on imaging.",
            evidence="32 mm mass with one biopsy-proven axillary node at diagnosis (M0); no interim restaging scan.",
            confidence="medium",
            source="notes/P-001-mdt-note.md",
        ),
        SpecialistView(
            role="Pathologist",
            hypothesis="High-risk luminal B profile; HER2 status cannot be called yet.",
            evidence="Grade 3 IDC, ER 90%/PR 40%/Ki-67 35%; HER2 IHC 2+ is equivocal by definition.",
            confidence="high",
            source=guideline,
        ),
        SpecialistView(
            role="Molecular specialist",
            hypothesis="HER2 status is the single dominant open variable for the regimen.",
            evidence="Reflex ISH ordered 18 Nov, due 25 Nov, still not in the record months later.",
            confidence="high",
            source=source,
        ),
        SpecialistView(
            role="Trial specialist",
            hypothesis="SYN-BR-101 looks relevant but is currently disqualified by toxicity grade.",
            evidence="SYN-BR-101 (ER+/HER2- neoadjuvant + CDK4/6i) excludes grade\u22652 neuropathy, present here.",
            confidence="medium",
            source=trials,
        ),
        SpecialistView(
            role="Real-world-evidence specialist",
            hypothesis="A closely comparable synthetic patient reached a good outcome without anti-HER2 therapy.",
            evidence="P-004: same equivocal HER2 IHC2+ presentation, ISH negative, near-complete pathologic response.",
            confidence="medium",
            source="patients/P-004.json",
        ),
    ]

    challenges = [
        ChallengeView(
            challenger="Molecular specialist",
            challenged="Oncologist",
            contested_evidence="HER2 ISH result",
            detail=(
                "The oncologist's plan assumes the current regimen is final, but the ISH result is over four months "
                "overdue and could still add anti-HER2 therapy. The plan cannot be considered settled."
            ),
            resolved=False,
        ),
        ChallengeView(
            challenger="Trial specialist",
            challenged="Oncologist",
            contested_evidence="Grade 2 sensory neuropathy",
            detail=(
                "SYN-BR-101 would otherwise fit this profile, but the oncologist has not flagged that the patient's "
                "current toxicity grade already excludes it – trial eligibility needs an explicit re-check."
            ),
            resolved=False,
        ),
        ChallengeView(
            challenger="Pathologist",
            challenged="Radiologist",
            contested_evidence="Response assessment",
            detail=(
                "Radiology has no interim restaging scan to confirm the response pathology would expect at week 5 "
                "of paclitaxel; pathology cannot corroborate treatment response without it."
            ),
            resolved=False,
        ),
    ]

    items = [
        UIItem(
            label="Neoadjuvant backbone is guideline-concordant",
            detail="EC \u2192 weekly paclitaxel without waiting for ISH follows the equivocal-HER2 pathway.",
            source=guideline,
            group="agreed",
        ),
        UIItem(
            label="Comparable synthetic patient supports the current regimen",
            detail="P-004 reached near-complete response on the same backbone once HER2 resolved negative.",
            source="patients/P-004.json",
            group="agreed",
        ),
        UIItem(
            label="Whether anti-HER2 therapy should be added",
            detail="Unresolved until ISH returns; oncologist and molecular specialist disagree on urgency.",
            group="disputed",
        ),
        UIItem(
            label="HER2 ISH result",
            detail="Ordered 18 Nov, due 25 Nov, still outstanding \u2013 top priority for pathology to chase.",
            source=source,
            group="missing",
        ),
        UIItem(
            label="Interim restaging imaging",
            detail="No scan since starting neoadjuvant therapy to confirm response before surgical planning.",
            group="missing",
        ),
        UIItem(
            label="Add or withhold anti-HER2 therapy once ISH returns",
            detail="The board must decide the regimen change, not the AI.",
            group="human_decision",
        ),
        UIItem(
            label="Whether to pursue paclitaxel dose modification for neuropathy",
            detail="Grade 2 neuropathy and low ANC both need an explicit board decision, not just 'considered'.",
            group="human_decision",
        ),
    ]

    block = UIBlock(
        type="specialist_debate",
        title="Six-specialist pre-board debate (deterministic demo)",
        specialists=specialists,
        challenges=challenges,
        items=items,
    )
    return AgentResult(
        mode="fallback",
        headline=f"Pre-board debate for {record.get('name', patient_id)} (deterministic demo)",
        blocks=[block],
        note="Copilot SDK not configured: set COPILOT_GITHUB_TOKEN. Showing a fixed six-specialist debate.",
    )


@router.post("/analyze")
async def analyze(request: AgentRequest) -> AgentResult:
    patient_id = request.patient_id or "P-001"
    if settings.copilot_auth_mode == "not-configured":
        return _deterministic_debate(patient_id)
    return await run_agent(
        AgentRequest(task=request.task, patient_id=patient_id, role=request.role),
        system_prompt=SYSTEM_PROMPT,
        prompt=_prompt(patient_id),
        extra_tools=[find_similar_patients],
    )
