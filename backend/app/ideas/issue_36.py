"""Cancer digital twin: compare three next-treatment paths for a progressing synthetic patient.

Closes GitHub issue #36. Two pieces work together:
- A deterministic simulation engine (``simulate_paths``) produces the three trajectories. Numbers
  are illustrative, not modelled from real outcome data - a hackathon prototype, not a clinical tool.
- The Copilot SDK agent (via ``run_agent``) grounds the assumptions behind each path in comparable
  synthetic patients and answers the clinician's follow-up questions, through a dedicated tool.
"""

import json

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent

router = APIRouter(prefix="/api/ideas/36")

SYSTEM_PROMPT = """\
You are the digital-twin assistant of the Oncology Hackathon 2026 Munich prototype. A clinician is \
comparing three simulated next-treatment paths for a patient whose disease has progressed. Your job \
is to ground the paths' assumptions in evidence and answer follow-up questions - never to choose a \
path yourself.

Rules:
- All data is SYNTHETIC (from /sample-data). Never ask for or invent real patient data.
- Use `get_patient` for the case facts and `find_comparable_patients` for synthetic precedent; cite \
  files or twin ids as `source`.
- Be explicit about assumptions and what is still unknown (e.g. an untested resistance mechanism).
- Anything that would change care goes into an `actions` block as a proposal for a human to \
  approve, edit or dismiss. You never make clinical decisions.
- Finish by calling `render_ui` exactly once.
"""


class TrajectoryPoint(BaseModel):
    month: int
    response_pct: int = Field(description="Simulated tumour response, percent shrinkage")
    progression_risk_pct: int = Field(description="Simulated cumulative risk of progression by this month")
    toxicity_grade: int = Field(description="Simulated worst CTCAE toxicity grade expected around this month")


class TreatmentPath(BaseModel):
    id: str
    name: str
    description: str
    trajectory: list[TrajectoryPoint]
    assumptions: list[str]
    evidence: list[str]


class TwinSimulation(BaseModel):
    patient_id: str
    headline: str
    paths: list[TreatmentPath]
    informative_test: str
    informative_test_reason: str
    note: str


def _cancer_type(primary: str) -> str:
    primary = primary.lower()
    for keyword, kind in (
        ("nsclc", "lung"),
        ("lung", "lung"),
        ("breast", "breast"),
        ("colon", "colorectal"),
        ("rect", "colorectal"),
    ):
        if keyword in primary:
            return kind
    return ""


def _comparable_patients(cancer_type: str) -> list[dict]:
    try:
        rows = sample_data.read("comparable_patients.csv")
    except FileNotFoundError:
        return []
    if not cancer_type:
        return rows
    return [row for row in rows if row.get("cancer_type") == cancer_type]


def simulate_paths(patient_id: str) -> TwinSimulation:
    """Deterministic digital-twin simulation: three next-treatment paths for one synthetic patient."""
    try:
        record = sample_data.get_patient(patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown patient '{patient_id}'") from exc

    cancer_type = _cancer_type(record.get("diagnosis", {}).get("primary", ""))

    egfr_status = record.get("diagnosis", {}).get("biomarkers", {}).get("EGFR", "")
    is_egfr_positive_lung_case = cancer_type == "lung" and "positive" in egfr_status.lower()

    if is_egfr_positive_lung_case:
        paths = [
            TreatmentPath(
                id="platinum_doublet_chemo",
                name="Switch to platinum-doublet chemotherapy",
                description="Carboplatin-pemetrexed after progression on osimertinib.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(month=1, response_pct=15, progression_risk_pct=10, toxicity_grade=2),
                    TrajectoryPoint(month=3, response_pct=30, progression_risk_pct=20, toxicity_grade=3),
                    TrajectoryPoint(month=6, response_pct=20, progression_risk_pct=45, toxicity_grade=3),
                ],
                assumptions=[
                    "Response independent of the (unknown) resistance mechanism",
                    "Carboplatin dosed for CKD stage 3 (eGFR 48) - higher toxicity risk assumed",
                ],
                evidence=["comparable_patients.csv: TWIN-014, TWIN-027"],
            ),
            TreatmentPath(
                id="continue_osimertinib_plus_sbrt",
                name="Continue osimertinib + local therapy (SBRT) to the new lesions",
                description="Keep the systemic drug that is still partly working; treat the two growing sites locally.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(month=1, response_pct=10, progression_risk_pct=10, toxicity_grade=1),
                    TrajectoryPoint(month=3, response_pct=15, progression_risk_pct=25, toxicity_grade=1),
                    TrajectoryPoint(month=6, response_pct=10, progression_risk_pct=55, toxicity_grade=1),
                ],
                assumptions=[
                    "Progression is truly oligo (only the two known sites) - not yet confirmed",
                    "Resistance mechanism does not make osimertinib fully ineffective elsewhere",
                ],
                evidence=["comparable_patients.csv: TWIN-041 (favourable), TWIN-052 (early diffuse progression)"],
            ),
            TreatmentPath(
                id="clinical_trial_SYN_LU_310",
                name="Enrol in trial SYN-LU-310 (liquid-biopsy-guided switch)",
                description="Repeat ctDNA, then switch therapy matched to the resistance mechanism it finds.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(month=1, response_pct=5, progression_risk_pct=10, toxicity_grade=1),
                    TrajectoryPoint(month=3, response_pct=25, progression_risk_pct=15, toxicity_grade=2),
                    TrajectoryPoint(month=6, response_pct=30, progression_risk_pct=25, toxicity_grade=2),
                ],
                assumptions=[
                    "Trial only benefits patients whose resistance mechanism is druggable and matched",
                    "Requires the repeat biopsy/ctDNA result before enrolment",
                ],
                evidence=[
                    "trials.csv: SYN-LU-310",
                    "comparable_patients.csv: TWIN-063 (sustained), TWIN-078 (modest, mechanism unclear)",
                ],
            ),
        ]
        note = (
            "Illustrative simulation for the Maria López scenario (hackathon prototype, synthetic data). "
            "Numbers are not modelled from real outcome data."
        )
        informative_test = "Repeat tissue or ctDNA biopsy to identify the resistance mechanism"
        informative_test_reason = (
            "The targeted-therapy and trial paths only make sense for specific resistance mechanisms; "
            "the chemotherapy path does not depend on it. This one test best separates the three paths."
        )
        headline = f"Digital twin: three next-treatment paths for {record.get('name')} after progression on osimertinib"
    else:
        has_renal_impairment = any(
            lab.get("test", "").lower() == "creatinine" and lab.get("flag") for lab in record.get("labs", [])
        )
        toxicity_bump = 1 if has_renal_impairment else 0
        paths = [
            TreatmentPath(
                id="switch_therapy",
                name="Switch systemic therapy",
                description="Move to the next standard-of-care regimen for this diagnosis.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(
                        month=1, response_pct=12, progression_risk_pct=12, toxicity_grade=1 + toxicity_bump
                    ),
                    TrajectoryPoint(
                        month=3, response_pct=25, progression_risk_pct=25, toxicity_grade=2 + toxicity_bump
                    ),
                    TrajectoryPoint(
                        month=6, response_pct=18, progression_risk_pct=45, toxicity_grade=2 + toxicity_bump
                    ),
                ],
                assumptions=["Generic illustrative curve; tailor per diagnosis in a future iteration."],
                evidence=[f"comparable_patients.csv (cancer_type={cancer_type or 'unspecified'})"],
            ),
            TreatmentPath(
                id="continue_plus_local",
                name="Continue current therapy + local therapy",
                description="Keep the current systemic treatment; add local therapy to progressing sites.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(month=1, response_pct=8, progression_risk_pct=10, toxicity_grade=1),
                    TrajectoryPoint(month=3, response_pct=12, progression_risk_pct=28, toxicity_grade=1),
                    TrajectoryPoint(month=6, response_pct=8, progression_risk_pct=55, toxicity_grade=1),
                ],
                assumptions=["Assumes oligoprogression, not diffuse resistance."],
                evidence=[f"comparable_patients.csv (cancer_type={cancer_type or 'unspecified'})"],
            ),
            TreatmentPath(
                id="clinical_trial",
                name="Enrol in a matched clinical trial",
                description="Screen for a synthetic trial matched to this diagnosis and profile.",
                trajectory=[
                    TrajectoryPoint(month=0, response_pct=0, progression_risk_pct=0, toxicity_grade=0),
                    TrajectoryPoint(month=1, response_pct=5, progression_risk_pct=10, toxicity_grade=1),
                    TrajectoryPoint(month=3, response_pct=20, progression_risk_pct=18, toxicity_grade=1),
                    TrajectoryPoint(month=6, response_pct=25, progression_risk_pct=30, toxicity_grade=1),
                ],
                assumptions=["Requires eligibility screening against trials.csv."],
                evidence=["trials.csv"],
            ),
        ]
        note = "Generic illustrative simulation (no case-specific tailoring for this patient yet)."
        informative_test = "Repeat imaging or biopsy to characterise the progression"
        informative_test_reason = "A generic placeholder recommendation until this case has a tailored simulation."
        headline = f"Digital twin: three next-treatment paths for {record.get('name')}"

    return TwinSimulation(
        patient_id=patient_id,
        headline=headline,
        paths=paths,
        informative_test=informative_test,
        informative_test_reason=informative_test_reason,
        note=note,
    )


@router.get("/twin/{patient_id}")
async def get_twin(patient_id: str) -> TwinSimulation:
    return simulate_paths(patient_id)


class ComparablePatientParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-004'")


@define_tool(
    description=(
        "Find synthetic comparable patients (a 'digital twin' cohort) with a similar cancer type, "
        "to ground the assumptions behind a treatment path in precedent."
    ),
    skip_permission=True,
)
def find_comparable_patients(params: ComparablePatientParams) -> str:
    try:
        record = sample_data.get_patient(params.patient_id)
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient"})
    cancer_type = _cancer_type(record.get("diagnosis", {}).get("primary", ""))
    return json.dumps(_comparable_patients(cancer_type))


@router.post("/ask")
async def ask(request: AgentRequest) -> AgentResult:
    return await run_agent(request, system_prompt=SYSTEM_PROMPT, extra_tools=[find_comparable_patients])
