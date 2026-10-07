"""Synthetic trial screening, never an eligibility decision or treatment recommendation."""

import asyncio
import json
import operator
from datetime import date
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent.models import AgentRequest, AgentResult
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/78", tags=["trial matching"])
Horizon = Literal["six-month", "future"]
DATA = "issue-78-trial-matching.json"


class ScreeningRequest(BaseModel):
    horizon: Horizon = "future"
    trial_ids: list[str] = Field(default_factory=list, max_length=4)


class HandoffRequest(BaseModel):
    horizon: Horizon = "future"
    trial_id: str


def handoff_details(trial: dict, facts: dict) -> dict:
    relevant_fields = {c["field"] for c in trial["criteria"]} & {"pathology", "ras", "msi", "therapy"}
    labels = {"pathology": "Pathology", "ras": "RAS", "msi": "MSI", "therapy": "Prior regimen"}
    return {
        "reference": "REF-078",
        "trial": trial["title"],
        "registry_id": trial["registry_id"],
        "clinical_summary": [
            f"{labels[field]}: {facts[field]['value']}"
            for field in sorted(relevant_fields)
            if facts[field]["value"] is not None
        ],
        "outstanding_checks": [c["text"] for c in trial["criteria"] if c["status"] != "Match"],
    }


def handoff_email(trial: dict, facts: dict) -> dict:
    details = handoff_details(trial, facts)
    return {
        "reference": details["reference"],
        "to": trial["site_contact"]["email"],
        "subject": f"Participation assessment enquiry — {trial['title']} / REF-078 (synthetic)",
        "body": (
            f"Dear {trial['site_contact']['name']},\n\n"
            f"Please assess potential participation in {trial['title']} ({trial['registry_id']}) "
            "for pseudonymised referral REF-078.\n"
            f"Minimum clinical summary: {'; '.join(details['clinical_summary'])}.\n"
            f"Outstanding checks: {'; '.join(details['outstanding_checks']) or 'Full protocol review required'}.\n"
            "Eligibility is not confirmed. Please advise on recruitment and further screening. "
            "Patient agreement and full trial-team validation are still required.\n\n"
            "Trial onboarding is handled by the trial site (out of scope). "
            "Synthetic email draft only; nothing has been sent."
        ),
        "channel": "email",
        "simulation": True,
    }


def referral_agreement(trial: dict, facts: dict) -> dict:
    email = handoff_email(trial, facts)
    return {
        **trial["referral_agreement"],
        "agreement_email": {
            **email,
            "subject": f"Institutional referral agreement enquiry — {trial['title']} (synthetic)",
            "body": (
                f"Dear {trial['site_contact']['name']},\n\n"
                f"Please advise whether an institutional referral agreement for {trial['title']} "
                "can be established with Klinikum Rewired München. "
                "No patient information is required for this institutional agreement enquiry.\n"
                "Synthetic draft only; nothing sent and no agreement established."
            ),
        },
        "referral_letter": email["body"],
    }


def screening(horizon: Horizon) -> dict:
    data = sample_data.read(DATA)
    dataset = sample_data.read("minimal-mdt-dataset.json")
    elements = {
        element["name"]: {**element, "group": group["group"]}
        for group in dataset["groups"]
        for element in group["elements"]
    }
    facts = {}
    coverage = []
    for key, fact in data["facts"].items():
        available = horizon == "future" or fact["six_month_available"]
        facts[key] = {
            **fact,
            "value": fact["value"] if available else None,
            "display": fact["display"] if available else "Not structured in the six-month dataset",
            "source": fact["source"] if available else "Clinic notes not mapped in this hospital demo",
        }
        element = elements.get(fact["dataset"])
        coverage.append(
            {
                "name": fact["dataset"],
                "group": element["group"] if element else "Outside minimal dataset",
                "likely_source": element["likely_source"] if element else "Not in dataset",
                "status": "Available" if available and fact["value"] is not None else "Missing",
            }
        )
    trials = []
    for trial in data["trials"]:
        if trial["status"] != "Recruiting" or (horizon == "six-month" and trial["scope"] != "local"):
            continue
        criteria = []
        for criterion in trial["criteria"]:
            fact = facts[criterion["field"]]
            value = fact["value"]
            reason = fact["display"]
            unknown = value is None
            if not unknown and criterion.get("max_age_days"):
                age = (
                    (date.fromisoformat(data["snapshot_date"]) - date.fromisoformat(fact["date"])).days
                    if fact.get("date")
                    else None
                )
                if age is None or age < 0 or age > criterion["max_age_days"]:
                    unknown = True
                    reason = "A current, dated result is required; available evidence is outside the trial window."
            if unknown:
                status = "Unknown"
            else:
                expected = criterion["expected"]
                matches = {"eq": operator.eq, "gte": operator.ge, "lte": operator.le, "lt": operator.lt}[
                    criterion["op"]
                ](value, expected)
                status = "Match" if matches else "Conflict"
                if criterion["field"] == "therapy" and value in ("", "none", "no prior systemic therapy"):
                    status = "Conflict"
                    reason = "No prior systemic therapy; the required prior regimen has not been received."
            criteria.append(
                {
                    **criterion,
                    "status": status,
                    "patient_label": fact["label"],
                    "patient_value": fact["display"],
                    "evidence": reason,
                    "source": fact["source"],
                    "protocol_source": f"{DATA} · {trial['id']} synthetic protocol §{criterion['id']}",
                }
            )
        counts = {status: sum(c["status"] == status for c in criteria) for status in ("Match", "Conflict", "Unknown")}
        gaps = [c for c in criteria if c["status"] == "Unknown"]
        enquiry = (
            f"Draft screening enquiry — {data['patient']['name']} ({data['patient']['id']}) / {trial['title']}.\n"
            f"Recorded diagnosis: {data['patient']['diagnosis']}. "
            "Please review the full protocol before considering enrolment. "
            + ("Outstanding evidence: " + "; ".join(c["text"] for c in gaps) + ". " if gaps else "")
            + "Please confirm current recruitment, complete eligibility, risks, alternatives and patient preference. "
            "Eligibility is not confirmed. No orders or referrals have been sent."
        )
        trials.append(
            {
                **trial,
                "criteria": criteria,
                "counts": counts,
                "assessment": (
                    "Conflict identified"
                    if counts["Conflict"]
                    else "Potential match · checks outstanding"
                    if counts["Unknown"]
                    else "Recorded criteria supported · trial-team confirmation required"
                ),
                "enquiry_note": enquiry,
                "proposed_orders": [f"Proposed evidence request: {c['text']}" for c in gaps],
                "handoff_email": handoff_email({**trial, "criteria": criteria}, facts),
                "referral_agreement": referral_agreement({**trial, "criteria": criteria}, facts),
            }
        )
    candidates = sorted(
        [t for t in trials if not t["counts"]["Conflict"] and t["status"] == "Recruiting"],
        key=lambda t: t["scope"] != "local",
    )[:4]
    therapy = facts["therapy"]["value"]
    treatment_naive = therapy in ("", "none", "no prior systemic therapy")
    return {
        "patient": {
            **data["patient"],
            "treatment_line": (
                "First-line consideration"
                if treatment_naive
                else data["patient"]["treatment_line"]
                if therapy is not None
                else "Treatment line: not recorded"
            ),
            "prior_systemic_treatment": (
                "no prior systemic therapy"
                if treatment_naive
                else f"Prior systemic treatment: {therapy}"
                if therapy is not None
                else "Prior systemic treatment: not recorded"
            ),
        },
        "snapshot_date": data["snapshot_date"],
        "facts": facts,
        "trials": candidates,
        "excluded_count": sum(bool(t["counts"]["Conflict"]) for t in trials),
        "excluded_trials": [t for t in trials if t["counts"]["Conflict"]],
        "coverage": coverage,
        "horizon": horizon,
        "notice": "Synthetic screening only. Not confirmed eligibility or a treatment recommendation.",
        "data_principles": "Patient data stays in the hospital by default. Only the minimum pseudonymised referral "
        "information leaves after clinician approval; this prototype simulates email only and sends nothing.",
    }


@router.get("/context")
def context(horizon: Horizon = "future"):
    return screening(horizon)


@router.post("/handoff")
async def handoff(request: HandoffRequest):
    assessment = screening(request.horizon)
    trial = next((t for t in assessment["trials"] if t["id"] == request.trial_id), None)
    if trial is None:
        raise HTTPException(status_code=422, detail="Select a current conflict-free screening candidate.")
    draft = trial["handoff_email"]
    details = handoff_details(trial, assessment["facts"])

    def fallback(_request: AgentRequest, note: str) -> AgentResult:
        return AgentResult(
            mode="fallback",
            headline="Pseudonymised email draft for clinician review",
            note=note,
            blocks=[UIBlock(type="actions", title="Participation email", body=draft["body"])],
        )

    try:
        result = await asyncio.wait_for(
            run_agent(
                AgentRequest(task="Draft a participation assessment email", patient_id="REF-078", role="Oncologist"),
                system_prompt=(
                    "Draft a synthetic email to a trial site for human review. Use only the supplied pseudonymised "
                    "details; no names, hospital patient IDs, demographics, dates, record sources or invented facts. "
                    "Do not call patient data tools. Render one actions block titled Participation email with the "
                    "email body. Include REF-078 and outstanding checks; eligibility is not confirmed. "
                    "Request assessment, never enrolment or treatment. Do not send email. "
                    "Trial onboarding is handled by the trial site (out of scope)."
                ),
                prompt=json.dumps(details),
                data_tools=[],
                fallback_builder=fallback,
            ),
            timeout=40,
        )
    except TimeoutError:
        result = fallback(AgentRequest(task="Draft email"), "Email drafting timed out. Synthetic demo draft retained.")
    body = next(
        (b.body for b in result.blocks if b.type == "actions" and b.title == "Participation email" and b.body),
        draft["body"],
    )
    identifiers = [assessment["patient"]["id"], *assessment["patient"]["name"].split()]
    if any(identifier.casefold() in body.casefold() for identifier in identifiers) or "REF-078" not in body:
        return {
            **draft,
            "mode": "fallback",
            "note": "Assistant draft failed pseudonymisation checks; demo draft retained.",
        }
    return {**draft, "body": body, "mode": result.mode, "note": result.note}


@router.post("/review")
async def review(request: ScreeningRequest):
    assessment = screening(request.horizon)
    if request.trial_ids:
        allowed = {trial["id"] for trial in assessment["trials"]}
        if not set(request.trial_ids) <= allowed:
            raise HTTPException(status_code=422, detail="Select only current conflict-free screening candidates.")
        assessment["trials"] = [t for t in assessment["trials"] if t["id"] in request.trial_ids]

    @define_tool(description="Read the synthetic patient evidence and trial criterion comparisons for this horizon.")
    async def inspect_trial_screening(params: ScreeningRequest) -> dict:
        return assessment

    try:
        result = await asyncio.wait_for(
            run_agent(
                AgentRequest(
                    task="Review potential trial matches and missing evidence", patient_id="TM-078", role="Oncologist"
                ),
                system_prompt=(
                    "You support synthetic oncology trial screening. Call inspect_trial_screening, then render_ui "
                    "with a concise prior-phase evidence comparison, subgroup findings and limitations. "
                    "All results are invented synthetic examples, not publications. Current studies are ongoing. "
                    "Cite the supplied protocol and record sources. "
                    "Match means only that one criterion is supported, never confirmed eligibility. "
                    "Keep conflicts and unknowns explicit; never recommend treatment or referral. "
                    "Do not read other patients or use other sample data. "
                    "All referral decisions belong to the oncologist. "
                    "For EACH candidate render an actions block with title EXACTLY its trial id "
                    "and body an enquiry note "
                    "for the trial team. Include outstanding evidence and proposed checks; no actual orders, sends, "
                    "enrolment, patient-specific treatment recommendations or invented clinical history."
                ),
                prompt=f"Review this {request.horizon} assessment: {json.dumps(assessment)}",
                extra_tools=[inspect_trial_screening],
                fallback_builder=lambda _request, note: demo_review(assessment, note),
            ),
            timeout=40,
        )
    except TimeoutError:
        result = demo_review(assessment, "Assistant review timed out. Editable synthetic demo drafts remain available.")
    notes = {t["id"]: t["enquiry_note"] for t in assessment["trials"]}
    if result.mode == "copilot":
        for block in result.blocks:
            if block.type == "actions" and block.title in notes and block.body:
                notes[block.title] = block.body
    return {**result.model_dump(), "enquiry_notes": notes}


def demo_review(assessment: dict, note: str) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="Screening candidates — evidence and enquiry drafts ready for clinician review",
        note=note,
        blocks=[
            *[
                UIBlock(
                    type="evidence",
                    title=f"{candidate['title']} · {candidate['assessment']}",
                    body=assessment["notice"],
                    items=[
                        UIItem(
                            label=f"{c['status']} · {c['text']}",
                            detail=c["evidence"],
                            source=f"{c['source']} → {c['protocol_source']}",
                            severity="warning" if c["status"] == "Unknown" else "info",
                        )
                        for c in candidate["criteria"]
                    ],
                )
                for candidate in assessment["trials"]
            ],
            UIBlock(
                type="evidence",
                title="Prior-phase comparison · invented examples, not clinical evidence",
                body="Do not compare response percentages as if these were head-to-head studies. "
                "Subgroups are small; all recruiting current phases have no results.",
                items=[
                    UIItem(
                        label=f"{candidate['title']} · phase {evidence['phase']}",
                        detail=f"{evidence['population']}: {evidence['result']} {evidence['limitation']}",
                        source=evidence["source"],
                    )
                    for candidate in assessment["trials"]
                    for evidence in candidate["evidence_track"]
                ],
            ),
            UIBlock(
                type="actions",
                title="For the oncologist to consider",
                body="Obtain current renal function; verify performance status "
                "and the full protocol with the trial team. "
                "No tests ordered, referrals sent or treatments recommended.",
            ),
            *[
                UIBlock(type="actions", title=candidate["id"], body=candidate["enquiry_note"])
                for candidate in assessment["trials"]
            ],
        ],
    )
