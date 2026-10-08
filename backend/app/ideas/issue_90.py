"""Synthetic access desk: rules decide, the Copilot assistant explains."""

import json
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import sample_data
from app.agent import run_agent
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/90", tags=["Data access desk"])
DATA_PATH = "issue-90-access-desk.json"


class AssessmentRequest(BaseModel):
    request_id: str
    horizon: Literal["future", "six-months"] = "future"


@router.get("/desk")
def desk():
    return sample_data.read(DATA_PATH)


def assess(request_id: str, horizon: str = "future") -> dict:
    data = desk()
    request = next((r for r in data["requests"] if r["id"] == request_id), None)
    if request is None:
        raise HTTPException(status_code=404, detail="Unknown synthetic request")

    rules = data["rules"]
    rule = min(
        rules,
        key=lambda r: sum(
            [
                request["purpose"] != r["purpose"],
                request["scope"] != r["scope"],
                not set(request["data"]) <= set(r["data"]),
                request["consent"] != r["consent"],
                request["permit"] != r["permit"],
            ]
        ),
    )
    checks = [
        {
            "label": label,
            "passed": request[key] == rule[key],
            "detail": f"Requested: {request[key]}; rule {rule['id']} requires: {rule[key]}.",
        }
        for label, key in [
            ("Consent", "consent"),
            ("Purpose-specific permit", "permit"),
            ("Hospital policy: purpose", "purpose"),
            ("Hospital policy: scope", "scope"),
        ]
    ]
    extra_fields = sorted(set(request["data"]) - set(rule["data"]))
    checks.append(
        {
            "label": "Hospital policy: data fields",
            "passed": not extra_fields,
            "detail": f"Outside rule: {', '.join(extra_fields)}."
            if extra_fields
            else f"All requested fields are allowed by {rule['id']}.",
        }
    )
    differences = [c["detail"] for c in checks if not c["passed"]]
    status = "review" if differences else "approved"
    if horizon == "six-months" and (
        request["purpose"] == "research" or request["scope"] != rules[0]["scope"] or request["consent"] != "recorded"
    ):
        status = "unavailable"
        differences.insert(
            0,
            "Not available in six months: research, live cross-hospital requests and unstructured consent "
            "need additional agreements or structured records.",
        )
    return {
        "request": request,
        "structured": {key: request[key] for key in ("purpose", "data", "scope")},
        "checks": checks,
        "status": status,
        "rule_id": rule["id"],
        "differences": differences,
    }


@define_tool(
    description="Check a synthetic agent request against steward-approved consent, permit and hospital rules. "
    "Read-only; returns a decision or prepared exception, never grants real data access.",
    skip_permission=True,
)
def assess_data_access(params: AssessmentRequest) -> str:
    return json.dumps(assess(params.request_id, params.horizon))


@router.post("/assess")
async def assessment(body: AssessmentRequest):
    result = assess(body.request_id, body.horizon)
    context = {"assessment": result, "weekly_log": desk()["log"], "draft_rule": desk()["suggestion"]}
    agent = await run_agent(
        AgentRequest(task=result["request"]["free_text"], role="Data steward"),
        system_prompt=(
            "You assist an oncology data steward using synthetic data only. Structure the free-text request "
            "as purpose, data fields and scope. Call assess_data_access with the supplied request ID and horizon. "
            "The deterministic tool decision is authoritative: do not override it. Explain each failed condition "
            "and the nearest approved rule. Render concise summary/evidence/alert UI blocks using render_ui. "
            "The weekly log shows three identical CRC-R17 exceptions: propose only the supplied scoped draft "
            "rule, citing LOG-03, LOG-04 and LOG-05; never activate a rule yourself. "
            "No real data access is granted. Unknown cases and unmatched rules require a steward."
        ),
        prompt=f"Request ID: {body.request_id}; horizon: {body.horizon}.\n{json.dumps(context)}",
        extra_tools=[assess_data_access],
    )
    if agent.mode == "fallback":
        agent = AgentResult(
            mode="fallback",
            headline="Request assessed against approved rules",
            note="Copilot SDK unavailable or not configured. Structured extraction and rule suggestion "
            "are seeded demo examples; the policy checks below are deterministic. No real access is granted.",
            trace=[TraceStep(tool="assess_data_access")],
            blocks=[
                UIBlock(
                    type="summary",
                    title="Structured request · demo extraction",
                    body=f"Purpose: {result['structured']['purpose']}. Scope: {result['structured']['scope']}.",
                    items=[UIItem(label=field, source=DATA_PATH) for field in result["structured"]["data"]],
                ),
                UIBlock(
                    type="evidence",
                    title="Why this decision",
                    items=[
                        UIItem(
                            label=f"{'Matched' if check['passed'] else 'Needs review'} · {check['label']}",
                            detail=check["detail"],
                            source=result["rule_id"],
                        )
                        for check in result["checks"]
                    ],
                ),
                UIBlock(
                    type="alert" if result["status"] != "approved" else "summary",
                    title="Steward review required" if result["status"] == "review" else result["status"].capitalize(),
                    body=" ".join(result["differences"])
                    or f"Every condition matched {result['rule_id']}. Approved for this task only.",
                ),
                UIBlock(
                    type="summary",
                    title="Weekly review · repeated exception",
                    body=desk()["suggestion"]["text"],
                    items=[UIItem(label=log_id, source=DATA_PATH) for log_id in desk()["suggestion"]["evidence_ids"]],
                ),
            ],
        )
    return {**result, "agent": agent}
