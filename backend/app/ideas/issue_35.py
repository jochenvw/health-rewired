"""Issue #35: self-running European clinical trial engine prototype."""

import json

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/35")


TRIAL_ENGINE_DATA = {
    "trial": {
        "id": "EU-LUNG-17",
        "title": "EGFR-mutant NSCLC first-line combination study",
        "target": 96,
        "enrolled": 31,
        "forecast": 78,
        "inclusion": ["NSCLC stage IV", "EGFR exon 19 deletion or L858R", "ECOG 0-1", "no prior metastatic EGFR TKI"],
    },
    "sites": [
        {
            "id": "MUC",
            "name": "Klinikum Rewired München",
            "country": "DE",
            "eligible": 9,
            "enrolled": 6,
            "forecast": 18,
            "status": "on track",
            "bottleneck": "screening list refreshed this morning",
        },
        {
            "id": "MIL",
            "name": "Istituto Oncologico Milano",
            "country": "IT",
            "eligible": 7,
            "enrolled": 2,
            "forecast": 11,
            "status": "lagging",
            "bottleneck": "prior-treatment fields missing in three records",
        },
        {
            "id": "AMS",
            "name": "Amsterdam Thoracic Cancer Centre",
            "country": "NL",
            "eligible": 5,
            "enrolled": 4,
            "forecast": 14,
            "status": "on track",
            "bottleneck": "awaiting two patient discussions",
        },
        {
            "id": "BCN",
            "name": "Hospital del Mar Barcelona",
            "country": "ES",
            "eligible": 6,
            "enrolled": 1,
            "forecast": 8,
            "status": "lagging",
            "bottleneck": "pathology addendum delayed",
        },
    ],
    "patients": [
        {
            "id": "MIL-204",
            "name": "Giulia Romano",
            "site": "MIL",
            "age": 61,
            "profile": "Stage IV NSCLC · EGFR exon 19 deletion · ECOG 1",
            "status": "match",
            "reason": "meets mutation, stage and ECOG criteria; no prior metastatic EGFR TKI recorded",
            "missing": "patient preference discussion",
        },
        {
            "id": "MIL-219",
            "name": "Marco Bianchi",
            "site": "MIL",
            "age": 70,
            "profile": "Stage IV NSCLC · EGFR L858R · ECOG 2",
            "status": "exclude",
            "reason": "ECOG 2 exceeds protocol limit",
            "missing": "",
        },
        {
            "id": "MIL-231",
            "name": "Elena Conti",
            "site": "MIL",
            "age": 58,
            "profile": "Stage IV NSCLC · EGFR pending · ECOG 1",
            "status": "needs data",
            "reason": "stage and ECOG fit, but mutation confirmation is not yet filed",
            "missing": "EGFR result; prior TKI history",
        },
        {
            "id": "BCN-118",
            "name": "Lucía Torres",
            "site": "BCN",
            "age": 64,
            "profile": "Stage IV NSCLC · EGFR exon 19 deletion · ECOG 0",
            "status": "match",
            "reason": "clear protocol fit; lives within 45 minutes of the site",
            "missing": "baseline CT uploaded to trial binder",
        },
        {
            "id": "BCN-144",
            "name": "Jordi Serra",
            "site": "BCN",
            "age": 73,
            "profile": "Stage IIIB NSCLC · EGFR L858R · ECOG 1",
            "status": "exclude",
            "reason": "locally advanced rather than metastatic disease",
            "missing": "",
        },
        {
            "id": "BCN-166",
            "name": "María Vidal",
            "site": "BCN",
            "age": 67,
            "profile": "Stage IV NSCLC · EGFR L858R · ECOG 1",
            "status": "needs data",
            "reason": "likely eligible, but prior adjuvant osimertinib dates are unclear",
            "missing": "treatment stop date; consent language preference",
        },
    ],
}


class TrialEngineParams(BaseModel):
    site_id: str = Field(default="MIL", description="Synthetic site id to screen, e.g. MIL or BCN")


@define_tool(description="Screen synthetic European oncology trial launch data for one site.", skip_permission=True)
def screen_trial_engine(params: TrialEngineParams) -> str:
    site_id = params.site_id.upper()
    site = next((site for site in TRIAL_ENGINE_DATA["sites"] if site["id"] == site_id), None)
    patients = [patient for patient in TRIAL_ENGINE_DATA["patients"] if patient["site"] == site_id]
    return json.dumps({"trial": TRIAL_ENGINE_DATA["trial"], "site": site, "patients": patients})


SYSTEM_PROMPT = (
    "You are the trial-launch assistant inside a synthetic oncology hospital system.\n"
    "Use the screen_trial_engine tool, explain matches and exclusions in plain clinical language, "
    "and render concise UI blocks.\n"
    "The investigator must approve eligibility, outreach, and real-world comparator entries before anything happens."
)


class TrialEngineRequest(BaseModel):
    site_id: str = Field(default="MIL", pattern=r"^[A-Za-z]{3}$")
    task: str = Field(
        default="Screen this lagging site, draft outreach, and propose comparable synthetic real-world controls.",
        min_length=3,
        max_length=1000,
    )


@router.post("/run")
async def run_trial_engine(request: TrialEngineRequest) -> AgentResult:
    site_id = request.site_id.upper()
    _site_for(site_id)
    prompt = (
        f"Screen site {site_id} for trial EU-LUNG-17. {request.task} "
        "Return blocks for: site bottleneck, patient matches/exclusions, outreach draft, and comparator "
        "cohort proposals."
    )
    result = await run_agent(
        AgentRequest(task=request.task, role="trial coordinator"),
        system_prompt=SYSTEM_PROMPT,
        prompt=prompt,
        extra_tools=[screen_trial_engine],
    )
    if result.mode == "copilot":
        return result
    return _fallback_result(site_id, result.note or "Copilot SDK not configured; showing deterministic demo.")


def _site_for(site_id: str) -> dict:
    site = next((site for site in TRIAL_ENGINE_DATA["sites"] if site["id"] == site_id), None)
    if site is None:
        raise HTTPException(status_code=422, detail=f"Unknown synthetic trial site '{site_id}'.")
    return site


def _fallback_result(site_id: str, note: str) -> AgentResult:
    site_id = site_id.upper()
    site = _site_for(site_id)
    patients = [patient for patient in TRIAL_ENGINE_DATA["patients"] if patient["site"] == site_id]
    matches = [patient for patient in patients if patient["status"] == "match"]
    needs_data = [patient for patient in patients if patient["status"] == "needs data"]
    return AgentResult(
        mode="fallback",
        headline=f"{site['name']} screened for EU-LUNG-17",
        trace=[TraceStep(tool="screen_trial_engine", arguments=site_id)],
        note=note,
        blocks=[
            UIBlock(
                type="alert",
                title="Recruitment bottleneck",
                severity="warning",
                body=f"{site['name']} is {site['status']}: {site['bottleneck']}.",
                items=[
                    UIItem(label="Eligible found", detail=str(site["eligible"]), source="synthetic trial launch data"),
                    UIItem(
                        label="Current forecast",
                        detail=f"{site['forecast']} patients",
                        source="simulated forecast",
                    ),
                ],
            ),
            UIBlock(
                type="evidence",
                title="Screening explanations",
                items=[
                    UIItem(
                        label=f"{patient['name']} · {patient['status']}",
                        detail=patient["reason"],
                        source=f"synthetic record {patient['id']}",
                        severity="warning" if patient["status"] == "needs data" else None,
                    )
                    for patient in patients
                ],
            ),
            UIBlock(
                type="actions",
                title="Human approval needed",
                body=(
                    "Approve, edit or dismiss these suggestions in the prototype screen before anything is sent "
                    "or filed."
                ),
                items=[
                    UIItem(
                        label=f"Ask {site['name']} to confirm {len(needs_data)} missing data item(s)",
                        detail="Draft outreach is prepared for the local coordinator.",
                    ),
                    UIItem(
                        label=f"Add {len(matches)} comparable non-trial patient(s) to the synthetic control queue",
                        detail="Statistician review remains required before use as evidence.",
                    ),
                ],
            ),
        ],
    )
