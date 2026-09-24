"""Issue #37 – A Europe-wide learning treatment system.

For one synthetic patient whose profile does not fit a trial, the agent sends a structured,
privacy-preserving comparability query to a simulated network of European hospitals, gathers the
treatment sequences comparable patients received and how they fared, and flags when the evidence
looks thin or one-sided. The oncologist decides the treatment; recording the outcome back into the
shared learning system is a separate, explicit human action (nothing is written until confirmed).
"""

import json
import statistics
import time
from typing import Any

from copilot import define_tool
from copilot.tools import Tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent

router = APIRouter(prefix="/api/ideas/37")

SYSTEM_PROMPT = """\
You are the European learning-treatment-system agent for the Oncology Hackathon 2026 Munich.
For the given synthetic patient, you help the oncologist see how comparable patients across a
simulated European hospital network were treated and what happened to them.

Rules:
- All data is SYNTHETIC. The network is simulated: hospitals only ever return aggregated counts
  and summaries, never another patient's raw record. Say so explicitly.
- Call `get_patient` first, then `query_eu_network` with that patient's id.
- Report treatment sequences ("approaches") comparable patients received, grouped, with how many
  patients and what happened to them, as an `evidence` block (cite the hospital/network origin).
- Always surface the evidence-quality flags the tool returns (small cohorts, hospitals
  concentrated in one country, follow-up too short) as an `alert` block — do not hide them.
- If asked to prepare an outcome-feedback entry, call `prepare_outcome_feedback` and show the
  draft as an `actions` block: the oncologist must confirm it in the UI before anything is
  recorded. You never record it yourself.
- The treatment decision is always the oncologist's and patient's. You show evidence, you don't decide.
- Finish by calling `render_ui` exactly once.
"""


class PatientIdParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-002'")


class PrepareFeedbackParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-002'")
    approach_category: str = Field(description="Which approach was chosen, e.g. 'biopsy_or_liquid_first'")
    chosen_treatment: str = Field(description="Plain-language description of what was decided")
    outcome_note: str = Field(default="Outcome not yet known", description="What happened, if known yet")


def _network() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    hospitals = {h["id"]: h for h in sample_data.read("eu_network/hospitals.json")["hospitals"]}
    cases = sample_data.read("eu_network/cohort.json")["cases"]
    return hospitals, cases


def _is_comparable(patient: dict[str, Any], case: dict[str, Any]) -> bool:
    """Deliberately simple matching: same cancer type, same EGFR-mutant status, same oligometastatic stage."""
    diagnosis = patient.get("diagnosis", {})
    primary = (diagnosis.get("primary") or "").lower()
    if "lung" not in primary or "lung" not in case.get("primary", "").lower():
        return False
    patient_egfr = (diagnosis.get("biomarkers", {}).get("EGFR") or "").lower()
    case_egfr = (case.get("biomarkers", {}).get("EGFR") or "").lower()
    if not patient_egfr or "negative" in patient_egfr or not case_egfr or "negative" in case_egfr:
        return False
    return case.get("stage_group") == "IV_oligometastatic"


APPROACH_LABELS = {
    "biopsy_or_liquid_first": "Confirm with (liquid) biopsy before changing therapy",
    "continue_tki_watchful": "Continue current targeted therapy, watchful imaging",
    "local_ablative_add": "Local ablative treatment (radiotherapy/surgery) to the new site, continue therapy",
    "switch_systemic": "Switch systemic therapy without confirming the new finding first",
}


def _query_eu_network(params: PatientIdParams) -> str:
    try:
        patient = sample_data.get_patient(params.patient_id)
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient", "known": sample_data.list_patients()})

    hospitals, cases = _network()
    matched = [c for c in cases if _is_comparable(patient, c)]

    by_hospital: dict[str, int] = {}
    by_country: dict[str, int] = {}
    for case in matched:
        hospital = hospitals.get(case["hospital_id"], {})
        by_hospital[hospital.get("name", case["hospital_id"])] = (
            by_hospital.get(hospital.get("name", case["hospital_id"]), 0) + 1
        )
        by_country[hospital.get("country", "?")] = by_country.get(hospital.get("country", "?"), 0) + 1

    approaches = []
    for category, label in APPROACH_LABELS.items():
        group = [c for c in matched if c["approach_category"] == category]
        if not group:
            continue
        outcomes: dict[str, int] = {}
        for c in group:
            outcomes[c["outcome_category"]] = outcomes.get(c["outcome_category"], 0) + 1
        pfs_values = [c["pfs_months"] for c in group if c.get("pfs_months") is not None]
        group_hospitals: dict[str, int] = {}
        for c in group:
            name = hospitals.get(c["hospital_id"], {}).get("name", c["hospital_id"])
            group_hospitals[name] = group_hospitals.get(name, 0) + 1
        approaches.append(
            {
                "approach": label,
                "n": len(group),
                "outcomes": outcomes,
                "median_pfs_months": round(statistics.median(pfs_values), 1) if pfs_values else None,
                "hospitals": [{"name": n, "n": c} for n, c in sorted(group_hospitals.items(), key=lambda kv: -kv[1])],
                "examples": [c["outcome_detail"] for c in group[:2]],
            }
        )
    approaches.sort(key=lambda a: -a["n"])

    flags = []
    if len(matched) < 5:
        flags.append(
            f"Only {len(matched)} comparable patients found network-wide – treat this as anecdote, not evidence."
        )
    if by_country:
        top_country, top_n = max(by_country.items(), key=lambda kv: kv[1])
        if top_n / len(matched) > 0.6:
            flags.append(
                f"{top_n} of {len(matched)} matches came from {top_country} alone – limited geographic diversity."
            )
    for a in approaches:
        if a["n"] < 3:
            flags.append(
                f"'{a['approach']}' is based on only {a['n']} patients – weak evidence for this specific approach."
            )
        if a["outcomes"].get("too_early", 0) == a["n"]:
            flags.append(f"'{a['approach']}' has no mature outcomes yet – too early to judge.")

    return json.dumps(
        {
            "network_hospitals_queried": len(hospitals),
            "matched_total": len(matched),
            "comparability_criteria": "Lung adenocarcinoma, EGFR-mutant, oligometastatic stage IV",
            "hospitals_with_matches": [
                {"name": n, "n": c} for n, c in sorted(by_hospital.items(), key=lambda kv: -kv[1])
            ],
            "approaches": approaches,
            "evidence_flags": flags,
            "privacy_note": (
                "Each hospital ran the query locally and returned only counts and summaries – "
                "no raw patient records crossed hospital boundaries."
            ),
        }
    )


@define_tool(
    description=(
        "Draft an outcome-feedback entry for the shared learning system (does not save it). "
        "The oncologist must confirm it in the UI before it is recorded."
    ),
    skip_permission=True,
)
def prepare_outcome_feedback(params: PrepareFeedbackParams) -> str:
    return json.dumps(
        {
            "draft": True,
            "patient_id": params.patient_id,
            "approach_category": params.approach_category,
            "approach_label": APPROACH_LABELS.get(params.approach_category, params.approach_category),
            "chosen_treatment": params.chosen_treatment,
            "outcome_note": params.outcome_note,
            "instructions": "Show this as a proposal. It is only recorded once the oncologist confirms it in the UI.",
        }
    )


query_eu_network = define_tool(
    "query_eu_network",
    description=(
        "Send a privacy-preserving comparability query to the simulated European hospital network for one "
        "patient. Returns only aggregated counts and outcome summaries per hospital, grouped by the "
        "treatment approach comparable patients received, plus evidence-quality flags."
    ),
    handler=_query_eu_network,
    params_type=PatientIdParams,
    skip_permission=True,
)

EXTRA_TOOLS: list[Tool] = [query_eu_network, prepare_outcome_feedback]

_LEARNING_LOG: list[dict[str, Any]] = []


class FeedbackIn(BaseModel):
    patient_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,32}$")
    approach_category: str
    chosen_treatment: str = Field(min_length=1, max_length=400)
    outcome_note: str = Field(default="Outcome not yet known", max_length=400)


class FeedbackOut(BaseModel):
    entry: dict[str, Any]
    total_learning_entries: int


@router.post("/query")
async def query(request: AgentRequest) -> AgentResult:
    return await run_agent(request, system_prompt=SYSTEM_PROMPT, extra_tools=EXTRA_TOOLS)


@router.get("/log")
async def learning_log() -> list[dict[str, Any]]:
    """Entries confirmed by an oncologist and fed back into the (simulated) shared learning system."""
    return _LEARNING_LOG


@router.post("/feedback", response_model=FeedbackOut)
async def record_feedback(body: FeedbackIn) -> FeedbackOut:
    """Explicit human action: nothing from the agent is recorded until the oncologist confirms it here."""
    if body.approach_category not in APPROACH_LABELS:
        raise HTTPException(status_code=400, detail="Unknown approach_category")
    entry = {
        "id": f"FB-{len(_LEARNING_LOG) + 1:04d}",
        "patient_id": body.patient_id,
        "approach_category": body.approach_category,
        "approach_label": APPROACH_LABELS[body.approach_category],
        "chosen_treatment": body.chosen_treatment,
        "outcome_note": body.outcome_note,
        "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _LEARNING_LOG.append(entry)
    return FeedbackOut(entry=entry, total_learning_entries=len(_LEARNING_LOG))
