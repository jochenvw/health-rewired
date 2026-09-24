"""Cohort-explorer engine: deterministic, rule-based real-world-cohort building.

This is intentionally *not* an LLM call: eligibility classification, outcome description and
"what changed after simulated follow-up" are computed from `/sample-data` with plain rules, so the
result is reproducible and traceable. The Copilot SDK agent (``runner.py``) reads this engine's
output through the ``propose_cohort_rules`` / ``build_cohort`` / ``simulate_followup`` tools and
decides how to narrate and structure it into UI blocks; the deterministic fallback (``fallback.py``)
renders the same output directly when the SDK is unavailable.

Nothing here establishes causality or recommends treatment - it only classifies, describes and
flags for human review, per the hackathon proposal for issue #27.
"""

from dataclasses import dataclass
from typing import Any, Literal

from app import sample_data

EligibilityStatus = Literal["eligible", "ineligible", "unknown"]


@dataclass
class PatientClassification:
    patient_id: str
    name: str
    status: EligibilityStatus
    reasons: list[str]
    outcome_summary: str
    outcome_missing: bool
    source: str


@dataclass
class CohortResult:
    trial_id: str
    trial_title: str
    treatment: str
    subgroup: str
    outcome: str
    rules: list[str]
    patients: list[PatientClassification]
    caveat: str = (
        "Descriptive only: group differences are not evidence that a treatment caused an outcome. "
        "A researcher must review before any conclusion is drawn."
    )

    @property
    def counts(self) -> dict[str, int]:
        counts = {"eligible": 0, "ineligible": 0, "unknown": 0}
        for patient in self.patients:
            counts[patient.status] += 1
        return counts


def list_trials() -> list[dict[str, Any]]:
    return sample_data.read("trials.csv")


def _get_trial(trial_id: str) -> dict[str, Any]:
    for trial in list_trials():
        if trial["trial_id"] == trial_id:
            return trial
    raise KeyError(trial_id)


def _cancer_bucket(primary: str) -> str:
    primary = (primary or "").lower()
    for keyword, kind in (("breast", "breast"), ("lung", "lung"), ("colon", "colorectal"), ("rect", "colorectal")):
        if keyword in primary:
            return kind
    return ""


def propose_rules(trial_id: str, outcome: str) -> tuple[list[str], dict[str, Any]]:
    """Human-readable cohort rules derived from the selected trial, for the researcher to approve."""
    trial = _get_trial(trial_id)
    rules = [
        f"Treatment / trial: {trial['trial_id']} — {trial['title']}",
        f'Subgroup: {trial["cancer_type"]} patients matching "{trial["key_inclusion"]}"',
        f"Excludes: {trial['key_exclusion']}",
        f"Outcome window: {outcome}, from diagnosis to the latest record on file",
    ]
    return rules, trial


def _biomarker_value(record: dict[str, Any], name: str) -> str | None:
    return record.get("diagnosis", {}).get("biomarkers", {}).get(name)


def classify_patient(record: dict[str, Any], trial: dict[str, Any]) -> tuple[EligibilityStatus, list[str]]:
    """Rule-based, traceable eligibility check against a trial's structured criteria columns."""
    reasons: list[str] = []
    diagnosis = record.get("diagnosis", {})
    bucket = _cancer_bucket(diagnosis.get("primary", ""))
    if bucket != trial["cancer_type"]:
        return "ineligible", [
            f"Different cancer type ({diagnosis.get('primary', 'unknown')} vs {trial['cancer_type']})"
        ]

    structured_clauses = 0

    ecog_max = trial.get("ecog_max")
    if ecog_max:
        structured_clauses += 1
        ecog = record.get("ecog")
        if ecog is not None and ecog > int(ecog_max):
            return "ineligible", [f"ECOG {ecog} exceeds trial maximum {ecog_max}"]
        reasons.append(f"ECOG {ecog} within trial maximum {ecog_max}")

    require_biomarker = trial.get("require_biomarker")
    if require_biomarker:
        structured_clauses += 1
        value = _biomarker_value(record, require_biomarker)
        if value is None:
            return "unknown", [f"{require_biomarker} not tested in this record"]
        if "pending" in value.lower():
            return "unknown", [f"{require_biomarker} result pending ({value})"]
        required = trial["require_value"].lower()
        if required not in value.lower():
            return "ineligible", [f"{require_biomarker} is '{value}', trial requires '{trial['require_value']}'"]
        reasons.append(f"{require_biomarker} is '{value}', matching trial requirement")

    exclude_biomarker = trial.get("exclude_biomarker")
    if exclude_biomarker:
        structured_clauses += 1
        value = _biomarker_value(record, exclude_biomarker)
        if value and trial["exclude_value"].lower() in value.lower():
            return "ineligible", [f"{exclude_biomarker} is '{value}', which the trial excludes"]

    regimen_keyword = trial.get("requires_regimen_keyword")
    if regimen_keyword:
        structured_clauses += 1
        treatments = record.get("treatments", [])
        match = next(
            (t for t in treatments if regimen_keyword.lower() in f"{t.get('type', '')} {t.get('regimen', '')}".lower()),
            None,
        )
        if not match:
            return "unknown", [f"No treatment record mentions '{regimen_keyword}'"]
        reasons.append(f"On treatment matching '{regimen_keyword}': {match.get('regimen')}")

    stage = diagnosis.get("stage", "")
    requires_stage_keyword = trial.get("requires_stage_keyword")
    if requires_stage_keyword:
        structured_clauses += 1
        if requires_stage_keyword not in stage:
            return "ineligible", [f"Stage '{stage}' does not include required marker '{requires_stage_keyword}'"]
        reasons.append(f"Stage '{stage}' includes required marker '{requires_stage_keyword}'")

    excludes_stage_keyword = trial.get("excludes_stage_keyword")
    if excludes_stage_keyword:
        structured_clauses += 1
        if excludes_stage_keyword in stage:
            return "ineligible", [f"Stage '{stage}' includes excluded marker '{excludes_stage_keyword}'"]

    if structured_clauses == 0:
        clause = trial["key_inclusion"]
        return "unknown", [
            f"No structured rule encoded yet for '{clause}' — needs manual review of the free-text criteria"
        ]

    return "eligible", reasons or ["Matches all structured trial criteria on file"]


def _numeric_trend(entries: list[dict[str, Any]], test: str) -> list[dict[str, Any]]:
    return [e for e in entries if e.get("test") == test]


def describe_outcome(record: dict[str, Any], outcome: str) -> tuple[str, bool]:
    """Short, source-linked description of what happened for one patient; flags missing data."""
    labs = record.get("labs", [])
    imaging = record.get("imaging", [])
    reported = record.get("patient_reported", [])

    if "imag" in outcome.lower() and imaging:
        last = imaging[-1]
        return f"Imaging ({last['modality']}, {last['date']}): {last['result']}", False

    if "symptom" in outcome.lower() and reported:
        last = reported[-1]
        return f"Patient-reported ({last['date']}): {last['symptom']} (grade {last['grade']})", False

    # Default / lab-trend outcome: pick whichever lab test has the most repeated measurements.
    tests = {lab["test"] for lab in labs}
    best_test, best_series = None, []
    for test in tests:
        series = _numeric_trend(labs, test)
        if len(series) > len(best_series):
            best_test, best_series = test, series
    if best_test and len(best_series) >= 2:
        values = " → ".join(f"{e['value']}{e['unit']}" for e in best_series)
        flagged = next((e for e in reversed(best_series) if e.get("flag")), None)
        flag_note = f" ({flagged['flag']} on {flagged['date']})" if flagged else ""
        return f"{best_test} trend: {values}{flag_note}", False
    if best_test:
        e = best_series[0]
        return f"{best_test}: {e['value']}{e['unit']} on {e['date']} (single measurement)", False

    return "No matching outcome data recorded yet", True


def build_cohort(
    trial_id: str, treatment: str, subgroup: str, outcome: str, simulated: dict[str, Any] | None = None
) -> CohortResult:
    """Classify every synthetic patient and describe their outcome for the given cohort question.

    ``simulated`` optionally maps patient_id -> extra lab/timeline entries (see ``simulate_followup``)
    to overlay on top of the on-file record, without ever writing to /sample-data.
    """
    trial = _get_trial(trial_id)
    rules, _ = propose_rules(trial_id, outcome)
    simulated = simulated or {}

    results: list[PatientClassification] = []
    for summary in sample_data.list_patients():
        patient_id = summary["id"]
        record = sample_data.get_patient(patient_id)
        if patient_id in simulated:
            record = {**record, "labs": [*record.get("labs", []), *simulated[patient_id].get("labs", [])]}
        status, reasons = classify_patient(record, trial)
        outcome_summary, missing = describe_outcome(record, outcome)
        results.append(
            PatientClassification(
                patient_id=patient_id,
                name=record.get("name", patient_id),
                status=status,
                reasons=reasons,
                outcome_summary=outcome_summary,
                outcome_missing=missing,
                source=f"patients/{patient_id}.json",
            )
        )

    return CohortResult(
        trial_id=trial["trial_id"],
        trial_title=trial["title"],
        treatment=treatment,
        subgroup=subgroup,
        outcome=outcome,
        rules=rules,
        patients=results,
    )


def simulate_followup(patient_id: str) -> dict[str, Any]:
    """Deterministic fictional follow-up: extrapolate the last lab trend one interval further.

    Purely in-memory and clearly synthetic; never written to /sample-data. Lets the "simulate new
    data" action show whether a finding still holds once more (fictional) outcomes arrive.
    """
    record = sample_data.get_patient(patient_id)
    labs = record.get("labs", [])
    tests = {lab["test"] for lab in labs}
    best_test, best_series = None, []
    for test in tests:
        series = _numeric_trend(labs, test)
        if len(series) > len(best_series):
            best_test, best_series = test, series

    if not best_test or len(best_series) < 2:
        return {"labs": [], "note": f"No repeated lab trend to extrapolate for {patient_id}."}

    last, prev = best_series[-1], best_series[-2]
    delta = last["value"] - prev["value"]
    next_value = round(last["value"] + delta, 1)
    ref_high = None
    if "<" in str(last.get("ref", "")):
        try:
            ref_high = float(last["ref"].lstrip("<"))
        except ValueError:
            ref_high = None
    flag = "high" if ref_high is not None and next_value > ref_high else last.get("flag")

    new_entry = {
        "date": "2026-04-13 (simulated)",
        "test": best_test,
        "value": next_value,
        "unit": last["unit"],
        "ref": last.get("ref", ""),
        "flag": flag,
        "synthetic_followup": True,
    }
    return {"labs": [new_entry], "note": f"Simulated next {best_test}: {last['value']} → {next_value}{last['unit']}"}


def build_simulated_diff(baseline: CohortResult, simulated: CohortResult) -> list[str]:
    """Plain-language "what changed" for the review queue, per patient."""
    lines: list[str] = []
    by_id = {p.patient_id: p for p in baseline.patients}
    for patient in simulated.patients:
        before = by_id.get(patient.patient_id)
        if before is None:
            continue
        if before.outcome_summary != patient.outcome_summary:
            lines.append(f"{patient.patient_id} ({patient.name}): {before.outcome_summary} → {patient.outcome_summary}")
        if before.status != patient.status:
            lines.append(f"{patient.patient_id}: eligibility changed from {before.status} to {patient.status}")
    if not lines:
        lines.append("No simulated follow-up changed the outcome descriptions or eligibility on file.")
    return lines
