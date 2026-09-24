"""Predict outcomes: reasons across labs, imaging and biomarkers, grounded in a matching trial.

See issue https://github.com/jochenvw/health-rewired/issues/31.
"""

import re

from fastapi import APIRouter

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.prompts import SYSTEM_PROMPT, build_prompt
from app.agent.ui import UIBlock, UIItem
from app.config import settings

router = APIRouter(prefix="/api/ideas/31")

OUTCOME_RISK_SYSTEM_PROMPT = (
    SYSTEM_PROMPT
    + """
- Focus on outcome risk: when labs, imaging, biomarkers and the treatment timeline together suggest
  an emerging concern (e.g. a new indeterminate finding alongside an abnormal biomarker trend),
  reason across all of them as one picture, search the synthetic trials for a matching one, and
  surface an `outcome_risk` block with the evidence trail and the matched trial. If there is no
  concern, say so plainly instead of inventing one.
"""
)

_CONCERN_KEYWORDS = {"new", "indeterminate", "progression", "progressive", "progressing"}
_WORD_RE = re.compile(r"[a-z0-9]+")


def _match_trial(record: dict, trials: list[dict]) -> dict | None:
    """Score synthetic trials by word-level overlap with this patient's regimen and biomarkers."""
    text = " ".join(t.get("regimen", "") for t in record.get("treatments", []))
    text += " " + " ".join(f"{k} {v}" for k, v in record.get("diagnosis", {}).get("biomarkers", {}).items())
    words = {w for w in _WORD_RE.findall(text.lower()) if len(w) > 3}

    def score(trial: dict) -> int:
        inclusion_words = set(_WORD_RE.findall(trial.get("key_inclusion", "").lower()))
        return len(words & inclusion_words)

    scored = sorted(trials, key=score, reverse=True)
    if scored and score(scored[0]) > 0:
        return scored[0]
    return None


def _build_outcome_risk(record: dict, source: str, trials: list[dict]) -> UIBlock | None:
    """Reason across imaging, labs and biomarkers together and ground any concern in a trial."""

    def _has_concern(result: str) -> bool:
        return bool(_CONCERN_KEYWORDS & set(_WORD_RE.findall(result.lower())))

    imaging_concerns = [img for img in record.get("imaging", []) if _has_concern(img["result"])]
    lab_concerns = [lab for lab in record.get("labs", []) if lab.get("flag")]
    if not imaging_concerns and not lab_concerns:
        return None

    items = [
        UIItem(
            label=f"Imaging: {img['modality']}",
            detail=img["result"],
            date=img["date"],
            source=source,
            severity="warning",
        )
        for img in imaging_concerns
    ] + [
        UIItem(
            label=f"Lab: {lab['test']} {lab['value']} {lab['unit']}",
            detail=f"{lab['flag']} (ref {lab['ref']}) on {lab['date']}",
            date=lab["date"],
            source=source,
            severity="warning",
        )
        for lab in lab_concerns
    ]
    biomarkers = record.get("diagnosis", {}).get("biomarkers", {})
    if biomarkers:
        items.append(
            UIItem(label="Biomarkers", detail=", ".join(f"{k} {v}" for k, v in biomarkers.items()), source=source)
        )

    trial = _match_trial(record, trials)
    if trial:
        items.append(
            UIItem(
                label=f"Matching trial {trial['trial_id']}: {trial['title']}",
                detail=f"Inclusion: {trial['key_inclusion']}",
                source="trials.csv",
            )
        )

    severity = "critical" if imaging_concerns and lab_concerns else "warning"
    narrative = (
        "Imaging, labs and biomarkers together suggest a possible outcome concern for "
        f"{record.get('name')}. Review before the next decision point."
    )
    return UIBlock(type="outcome_risk", title="Outcome risk", severity=severity, body=narrative, items=items)


def _fallback_outcome_risk(request: AgentRequest, note: str) -> AgentResult:
    """Deterministic outcome-risk demo used when the Copilot SDK is not configured or fails."""
    patients = sample_data.list_patients()
    patient_id = request.patient_id or (patients[0]["id"] if patients else None)
    trace = [TraceStep(tool="list_sample_data")]
    if not patient_id:
        return AgentResult(
            mode="fallback",
            headline="No sample data found",
            blocks=[UIBlock(type="alert", title="Sample data missing", body="Add files to /sample-data.")],
            trace=trace,
            note=note,
        )

    record = sample_data.get_patient(patient_id)
    source = f"patients/{patient_id}.json"
    trace.append(TraceStep(tool="get_patient", arguments=patient_id))
    diagnosis = record.get("diagnosis", {})
    kind = diagnosis.get("primary", "").lower()
    trials = [t for t in sample_data.read("trials.csv") if t["cancer_type"] in kind]
    trace.append(TraceStep(tool="read_sample_data", arguments="trials.csv"))

    outcome_risk = _build_outcome_risk(record, source, trials)
    trace.append(TraceStep(tool="predict_outcome_risk", arguments=patient_id))
    if outcome_risk:
        blocks = [outcome_risk]
        headline = f"Outcome risk flagged for {record.get('name')} (deterministic demo)"
    else:
        blocks = [
            UIBlock(
                type="summary",
                title="No emerging concern",
                body=f"Labs, imaging and biomarkers for {record.get('name')} show nothing to flag right now.",
            )
        ]
        headline = f"No outcome risk flagged for {record.get('name')} (deterministic demo)"

    return AgentResult(mode="fallback", headline=headline, blocks=blocks, trace=trace, note=note)


@router.post("/run")
async def run(request: AgentRequest) -> AgentResult:
    if settings.copilot_auth_mode == "not-configured":
        return _fallback_outcome_risk(request, "Copilot SDK not configured: set COPILOT_GITHUB_TOKEN.")
    return await run_agent(
        request,
        system_prompt=OUTCOME_RISK_SYSTEM_PROMPT,
        prompt=build_prompt(request.task, request.patient_id, request.role),
    )
