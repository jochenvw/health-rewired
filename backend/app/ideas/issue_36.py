"""Cancer digital twin: compare three next-treatment paths for a progressing synthetic patient.

Closes GitHub issue #36. Two pieces work together:
- A deterministic simulation engine (``simulate_paths``) produces the three trajectories and lets a
  clinician explore "what-if" inputs (a repeat-biopsy result, a toxicity/response priority) that
  immediately recompute the trajectories and the explanation - a counterfactual digital twin, not a
  static comparison. Numbers are illustrative, not modelled from real outcome data.
- The Copilot SDK agent (via ``run_agent``) grounds the assumptions behind each path in comparable
  synthetic patients and answers the clinician's follow-up questions, through a dedicated tool.
"""

import json
from typing import Literal

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

BiopsyResult = Literal["unknown", "met_amplification", "t790m", "no_mechanism_found"]
Priority = Literal["balanced", "minimize_toxicity", "maximize_response"]

BIOPSY_LABELS: dict[BiopsyResult, str] = {
    "unknown": "not yet done",
    "met_amplification": "MET amplification confirmed",
    "t790m": "T790M confirmed",
    "no_mechanism_found": "no resistance mechanism found",
}


class TrajectoryPoint(BaseModel):
    month: int
    response_pct: int = Field(description="Simulated tumour response, percent shrinkage")
    progression_risk_pct: int = Field(description="Simulated cumulative risk of progression by this month")
    toxicity_grade: int = Field(description="Simulated worst CTCAE toxicity grade expected around this month")
    note: str | None = Field(default=None, description="Assumption or evidence that starts applying at this point")
    note_kind: Literal["assumption", "evidence"] | None = None


class TreatmentPath(BaseModel):
    id: str
    name: str
    description: str
    trajectory: list[TrajectoryPoint]
    assumptions: list[str]
    evidence: list[str]


class WhatIf(BaseModel):
    biopsy_result: BiopsyResult = "unknown"
    priority: Priority = "balanced"


class TwinSimulation(BaseModel):
    patient_id: str
    headline: str
    paths: list[TreatmentPath]
    informative_test: str
    informative_test_reason: str
    note: str
    what_if: WhatIf
    what_if_explanation: str


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


def _point(
    month: int,
    response: int,
    risk: int,
    toxicity: int,
    note: str | None = None,
    kind: Literal["assumption", "evidence"] | None = None,
) -> TrajectoryPoint:
    return TrajectoryPoint(
        month=month,
        response_pct=response,
        progression_risk_pct=risk,
        toxicity_grade=toxicity,
        note=note,
        note_kind=kind,
    )


def _egfr_lung_paths(biopsy_result: BiopsyResult, priority: Priority) -> tuple[list[TreatmentPath], str]:
    """Tailored twin for an EGFR-positive lung case with oligoprogression (Maria López's profile)."""
    # Mechanism-dependent shift: once the biopsy result is known, "continue + local therapy" and the
    # matched-trial path diverge from their uncertain baseline; chemotherapy is mechanism-agnostic.
    continue_delta = {
        "unknown": (0, 0),
        "met_amplification": (-10, 20),
        "t790m": (-5, 10),
        "no_mechanism_found": (5, -10),
    }
    trial_delta = {"unknown": (0, 0), "met_amplification": (5, -5), "t790m": (10, -8), "no_mechanism_found": (-10, 10)}
    c_response_delta, c_risk_delta = continue_delta[biopsy_result]
    t_response_delta, t_risk_delta = trial_delta[biopsy_result]

    # Priority-dependent shift: only the chemotherapy path has a clinically meaningful dose trade-off.
    chemo_response_delta, chemo_toxicity_delta = {
        "balanced": (0, 0),
        "minimize_toxicity": (-8, -1),
        "maximize_response": (6, 0),
    }[priority]

    continue_note = {
        "unknown": (
            "Assumption: progression is truly oligo (only the two known sites) - not yet confirmed",
            "assumption",
        ),
        "met_amplification": (
            "Evidence: MET amplification confirmed - resembles TWIN-052 (early diffuse progression)",
            "evidence",
        ),
        "t790m": ("Evidence: T790M confirmed - osimertinib partly bypassed, resembles TWIN-052", "evidence"),
        "no_mechanism_found": (
            "Evidence: no resistance mechanism found - oligoprogression assumption holds, resembles TWIN-041",
            "evidence",
        ),
    }[biopsy_result]
    trial_note = {
        "unknown": ("Assumption: requires the repeat biopsy/ctDNA result before enrolment", "assumption"),
        "met_amplification": (
            "Evidence: matched to confirmed MET amplification - resembles TWIN-063 (sustained response)",
            "evidence",
        ),
        "t790m": ("Evidence: matched to confirmed T790M - resembles TWIN-063 (sustained response)", "evidence"),
        "no_mechanism_found": (
            "Evidence: no mechanism to match - resembles TWIN-078 (modest, mechanism unclear)",
            "evidence",
        ),
    }[biopsy_result]
    chemo_note = {
        "balanced": ("Assumption: standard-dose regimen, response independent of resistance mechanism", "assumption"),
        "minimize_toxicity": (
            "Assumption: dose de-escalated given CKD stage 3 and a toxicity-minimising priority",
            "assumption",
        ),
        "maximize_response": ("Assumption: full-dose regimen prioritising response over toxicity", "assumption"),
    }[priority]

    def clamp(value: int, low: int = 0, high: int = 100) -> int:
        return max(low, min(high, value))

    paths = [
        TreatmentPath(
            id="platinum_doublet_chemo",
            name="Switch to platinum-doublet chemotherapy",
            description="Carboplatin-pemetrexed after progression on osimertinib.",
            trajectory=[
                _point(0, 0, 0, 0),
                _point(1, clamp(15 + chemo_response_delta), 10, clamp(2 + chemo_toxicity_delta, 0, 5)),
                _point(3, clamp(30 + chemo_response_delta), 20, clamp(3 + chemo_toxicity_delta, 0, 5), *chemo_note),
                _point(
                    6,
                    clamp(20 + chemo_response_delta),
                    45,
                    clamp(3 + chemo_toxicity_delta, 0, 5),
                    "Evidence: TWIN-014 needed a dose reduction for renal toxicity; TWIN-027 tolerated it",
                    "evidence",
                ),
            ],
            assumptions=[chemo_note[0], "Carboplatin dosed for CKD stage 3 (eGFR 48) - higher toxicity risk assumed"],
            evidence=["comparable_patients.csv: TWIN-014, TWIN-027"],
        ),
        TreatmentPath(
            id="continue_osimertinib_plus_sbrt",
            name="Continue osimertinib + local therapy (SBRT) to the new lesions",
            description="Keep the systemic drug that is still partly working; treat the two growing sites locally.",
            trajectory=[
                _point(0, 0, 0, 0),
                _point(1, clamp(10 + c_response_delta), clamp(10 + c_risk_delta), 1, *continue_note),
                _point(3, clamp(15 + c_response_delta), clamp(25 + c_risk_delta), 1),
                _point(
                    6,
                    clamp(10 + c_response_delta),
                    clamp(55 + c_risk_delta),
                    1,
                    "Evidence: TWIN-041 kept local control; TWIN-052 progressed diffusely",
                    "evidence",
                ),
            ],
            assumptions=[
                continue_note[0],
                "Resistance mechanism does not make osimertinib fully ineffective elsewhere",
            ],
            evidence=["comparable_patients.csv: TWIN-041 (favourable), TWIN-052 (early diffuse progression)"],
        ),
        TreatmentPath(
            id="clinical_trial_SYN_LU_310",
            name="Enrol in trial SYN-LU-310 (liquid-biopsy-guided switch)",
            description="Repeat ctDNA, then switch therapy matched to the resistance mechanism it finds.",
            trajectory=[
                _point(0, 0, 0, 0),
                _point(1, clamp(5 + t_response_delta), clamp(10 + t_risk_delta), 1, *trial_note),
                _point(3, clamp(25 + t_response_delta), clamp(15 + t_risk_delta), 2),
                _point(
                    6,
                    clamp(30 + t_response_delta),
                    clamp(25 + t_risk_delta),
                    2,
                    "Evidence: TWIN-063 sustained response; TWIN-078 modest without a confirmed mechanism",
                    "evidence",
                ),
            ],
            assumptions=[
                trial_note[0],
                "Trial only benefits patients whose resistance mechanism is druggable and matched",
            ],
            evidence=[
                "trials.csv: SYN-LU-310",
                "comparable_patients.csv: TWIN-063 (sustained), TWIN-078 (modest, mechanism unclear)",
            ],
        ),
    ]

    explanation_parts = []
    if biopsy_result == "unknown":
        explanation_parts.append(
            "Baseline simulation: the resistance mechanism is still unknown, so the continue and trial paths carry "
            "their full uncertainty."
        )
    else:
        explanation_parts.append(
            f"With the repeat biopsy showing {BIOPSY_LABELS[biopsy_result]}, the projections for 'continue + local "
            "therapy' and the matched trial shift to match the confirmed mechanism; chemotherapy is unchanged "
            "because it does not depend on the mechanism."
        )
    if priority == "minimize_toxicity":
        explanation_parts.append(
            "Priority set to minimise toxicity: the chemotherapy path is simulated at a reduced dose."
        )
    elif priority == "maximize_response":
        explanation_parts.append("Priority set to maximise response: the chemotherapy path is simulated at full dose.")
    return paths, " ".join(explanation_parts)


def simulate_paths(
    patient_id: str,
    biopsy_result: BiopsyResult = "unknown",
    priority: Priority = "balanced",
) -> TwinSimulation:
    """Deterministic digital-twin simulation: three next-treatment paths for one synthetic patient.

    ``biopsy_result`` and ``priority`` are clinician-controlled what-if inputs: changing either one
    recomputes the trajectories and the explanation, so the twin behaves as a counterfactual
    simulation rather than a fixed comparison.
    """
    try:
        record = sample_data.get_patient(patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown patient '{patient_id}'") from exc

    cancer_type = _cancer_type(record.get("diagnosis", {}).get("primary", ""))
    egfr_status = record.get("diagnosis", {}).get("biomarkers", {}).get("EGFR", "")
    is_egfr_positive_lung_case = cancer_type == "lung" and "positive" in egfr_status.lower()

    if is_egfr_positive_lung_case:
        paths, what_if_explanation = _egfr_lung_paths(biopsy_result, priority)
        note = (
            "Illustrative simulation for the Maria López scenario (hackathon prototype, synthetic data). "
            "Numbers are not modelled from real outcome data."
        )
        if biopsy_result == "unknown":
            informative_test = "Repeat tissue or ctDNA biopsy to identify the resistance mechanism"
            informative_test_reason = (
                "The targeted-therapy and trial paths only make sense for specific resistance mechanisms; "
                "the chemotherapy path does not depend on it. This one test best separates the three paths."
            )
        else:
            informative_test = "Restaging CT at 6-8 weeks on the chosen path"
            informative_test_reason = (
                f"The resistance mechanism is now known ({BIOPSY_LABELS[biopsy_result]}), so the remaining "
                "uncertainty is whether the simulated trajectory holds - an early restaging scan confirms it."
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
                    _point(0, 0, 0, 0),
                    _point(1, 12, 12, 1 + toxicity_bump),
                    _point(3, 25, 25, 2 + toxicity_bump),
                    _point(6, 18, 45, 2 + toxicity_bump),
                ],
                assumptions=["Generic illustrative curve; tailor per diagnosis in a future iteration."],
                evidence=[f"comparable_patients.csv (cancer_type={cancer_type or 'unspecified'})"],
            ),
            TreatmentPath(
                id="continue_plus_local",
                name="Continue current therapy + local therapy",
                description="Keep the current systemic treatment; add local therapy to progressing sites.",
                trajectory=[
                    _point(0, 0, 0, 0),
                    _point(1, 8, 10, 1),
                    _point(3, 12, 28, 1),
                    _point(6, 8, 55, 1),
                ],
                assumptions=["Assumes oligoprogression, not diffuse resistance."],
                evidence=[f"comparable_patients.csv (cancer_type={cancer_type or 'unspecified'})"],
            ),
            TreatmentPath(
                id="clinical_trial",
                name="Enrol in a matched clinical trial",
                description="Screen for a synthetic trial matched to this diagnosis and profile.",
                trajectory=[
                    _point(0, 0, 0, 0),
                    _point(1, 5, 10, 1),
                    _point(3, 20, 18, 1),
                    _point(6, 25, 30, 1),
                ],
                assumptions=["Requires eligibility screening against trials.csv."],
                evidence=["trials.csv"],
            ),
        ]
        note = "Generic illustrative simulation (no case-specific tailoring for this patient yet)."
        informative_test = "Repeat imaging or biopsy to characterise the progression"
        informative_test_reason = "A generic placeholder recommendation until this case has a tailored simulation."
        headline = f"Digital twin: three next-treatment paths for {record.get('name')}"
        what_if_explanation = (
            "What-if inputs are only tailored for the Maria López (EGFR-positive lung) scenario so far."
        )

    return TwinSimulation(
        patient_id=patient_id,
        headline=headline,
        paths=paths,
        informative_test=informative_test,
        informative_test_reason=informative_test_reason,
        note=note,
        what_if=WhatIf(biopsy_result=biopsy_result, priority=priority),
        what_if_explanation=what_if_explanation,
    )


@router.get("/twin/{patient_id}")
async def get_twin(
    patient_id: str,
    biopsy_result: BiopsyResult = "unknown",
    priority: Priority = "balanced",
) -> TwinSimulation:
    return simulate_paths(patient_id, biopsy_result=biopsy_result, priority=priority)


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
