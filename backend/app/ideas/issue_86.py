"""Synthetic audit-trail review for issue 86."""

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent.models import AgentRequest, AgentResult
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/86")

AUDIT_DATA = "issue-86-audit-events.json"

SYSTEM_PROMPT = """You help a health inspector review one synthetic oncology adverse-event episode.
Use only the issue-86 audit evidence tool and never infer blame or decide root cause.
Call the evidence tool, then render a concise, neutral review with the timeline signal, what was
available at the decision, what arrived later, the possible protocol deviation, similar synthetic
patterns, and the explicitly simulated integrity check. The inspector decides relevance and actions."""


class NoParams(BaseModel):
    pass


@define_tool(description="Read the synthetic episode audit records for this investigation.", skip_permission=True)
def read_audit_evidence(params: NoParams) -> str:
    return sample_data.read_text(AUDIT_DATA)


def _demo_review(note: str | None = None) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="Synthetic review · dose verification needs follow-up",
        blocks=[
            UIBlock(
                type="alert",
                title="Potential protocol deviation",
                severity="warning",
                body="The eGFR result was available before the board recommendation. The pharmacy order has no linked renal-dose review in this synthetic episode.",
                items=[
                    UIItem(label="Available at 08:30", detail="eGFR 38 · recorded 07:42", source="Synthetic lab result"),
                    UIItem(label="Arrived later", detail="MMR pathology addendum · recorded 11:15", source="Synthetic pathology report"),
                ],
            ),
            UIBlock(
                type="evidence",
                title="Similar synthetic patterns",
                items=[
                    UIItem(label="AE-2026-019 · Medical oncology", detail="Pharmacy check documented after order entry."),
                    UIItem(label="AE-2026-027 · Day unit", detail="Dose-verification handoff not linked to infusion record."),
                ],
            ),
            UIBlock(
                type="summary",
                title="For the inspector to assess",
                body="The records show a possible handoff gap; they do not establish why it happened or who is responsible.",
            ),
        ],
        trace=[],
        note=note or "Deterministic synthetic demo. Configure the Copilot SDK for agent-assembled findings.",
    )


def _audit_fallback(request: AgentRequest, note: str) -> AgentResult:
    return _demo_review(note)


@router.post("/review", response_model=AgentResult)
async def review_audit_trail(request: AgentRequest) -> AgentResult:
    result = await run_agent(
        request,
        system_prompt=SYSTEM_PROMPT,
        prompt=(
            f"Review the synthetic adverse-event episode. Inspector's focus: {request.task}\n"
            "Read the episode evidence before summarising it."
        ),
        extra_tools=[read_audit_evidence],
        include_data_tools=False,
        fallback_builder=_audit_fallback,
    )
    return result
