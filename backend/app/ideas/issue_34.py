"""Idea: AI European Tumour Board – pre-board analysis (issue #34).

Convenes specialist AI personas (radiology, pathology, molecular/genomics, treatment, clinical
trials & real-world evidence) over one synthetic complex case. They must challenge each other's
assumptions and hand the tumour board an evidence-backed diagnostic and treatment hypothesis to
review before the meeting – the board still owns the actual decision.
"""

import json

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent

router = APIRouter(prefix="/api/ideas/34")

SYSTEM_PROMPT = """\
You are the AI pre-board coordinator for a European tumour board. All data is SYNTHETIC (from
/sample-data). Never invent or assume real patient data; use tools to gather every fact and cite
the file it came from as `source`.

Think through the case from five specialist angles before you answer, as if each spoke in turn:
- Radiology: what imaging shows, and does not show.
- Pathology: histology, grade, receptor/IHC results – confirmed vs. still pending.
- Molecular/genomics: biomarkers, mutations, outstanding testing.
- Treatment (medical oncology): guideline-concordant options given comorbidities and toxicity risk.
- Clinical trials & real-world evidence: matching trials (trials.csv) and comparable synthetic
  patients (call find_similar_patients), noting how similar they really are and what that implies.

The specialists must actively disagree where the evidence disagrees: if one persona's reading
conflicts with another (for example a pending result that could change the treatment persona's
plan), surface that conflict explicitly rather than smoothing it over. Note anything a specialist
would need but does not yet have.

Finish by calling `render_ui` exactly once, with:
- one `patient_card` block: the case's key facts.
- one `evidence` block titled "Where the specialists agree": each item's `label` names the
  specialist, `detail` its finding, with a `source`.
- one `alert` block (severity `warning`) titled "Where the specialists disagree or evidence is
  missing": one item per open disagreement or gap, `detail` explains it and who would close it.
- one `evidence` block titled "Comparable trials and synthetic patients": each item's `source`
  names the trial id or patient id it came from.
- one `actions` block titled "Draft pre-board hypothesis (human decision)": the diagnostic and
  treatment hypothesis stated as proposals for the tumour board to approve, edit or dismiss –
  never as a decision already made.
Keep every item short and clinical.
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
        "then convene the specialist debate as instructed and call render_ui."
    )


@router.post("/analyze")
async def analyze(request: AgentRequest) -> AgentResult:
    patient_id = request.patient_id or "P-001"
    return await run_agent(
        AgentRequest(task=request.task, patient_id=patient_id, role=request.role),
        system_prompt=SYSTEM_PROMPT,
        prompt=_prompt(patient_id),
        extra_tools=[find_similar_patients],
    )
