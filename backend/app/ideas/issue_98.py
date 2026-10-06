"""Agent elicitation for the tacit knowledge MDT walkthrough."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/98", tags=["idea-98"])

SYSTEM_PROMPT = """You are an oncology MDT assistant in a synthetic hackathon prototype.
The clinician's treatment decision is theirs and is never judged or changed. Structure their
explanation as provenance-aware clinical evidence. Use render_ui with one evidence block and
one summary block. Do not make a diagnosis, recommendation, or claim beyond the clinician's words."""


class CaptureRequest(BaseModel):
    explanation: str = Field(min_length=6, max_length=1200)


def _demo_result(explanation: str) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="The missing context is now visible",
        note=(
            "Deterministic demo mode: the Copilot SDK is not configured. "
            "Your words are preserved as synthetic MDT evidence."
        ),
        blocks=[
            UIBlock(
                type="evidence",
                title="Newly captured clinical observation",
                body="Clinician-confirmed context explaining why treatment Y was chosen.",
                items=[
                    UIItem(label="Concept", detail="Observed functional deterioration"),
                    UIItem(label="Observation", detail=explanation),
                    UIItem(label="Source", detail="Treating clinician"),
                    UIItem(label="Capture method", detail="Agent elicitation"),
                    UIItem(label="Status", detail="Clinician confirmed"),
                    UIItem(label="Relevance", detail="Influenced treatment intensity"),
                ],
            )
        ],
        trace=[],
    )


@router.post("/capture", response_model=AgentResult)
async def capture_explanation(request: CaptureRequest) -> AgentResult:
    task = (
        "Structure the clinician's MDT explanation as a provenance-aware observation. "
        "Case context: two synthetic, similar stage III colorectal cancer cases; the guideline "
        "suggests treatment X, and the clinician chose gentler treatment Y for Patient B. "
        "The clinician's explanation is below. Preserve its meaning verbatim; do not judge the "
        "choice, change treatment, or invent facts.\n\n"
        f"Clinician explanation: {request.explanation}"
    )
    result = await run_agent(
        AgentRequest(task=task, role="Tumour board clinician"),
        system_prompt=SYSTEM_PROMPT,
    )
    if result.mode == "fallback":
        return _demo_result(request.explanation)
    return result
