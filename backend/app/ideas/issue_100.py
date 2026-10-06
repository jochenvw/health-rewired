"""Copilot support for the synthetic data-trust walkthrough."""

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app.agent import AgentRequest, AgentResult, run_agent

router = APIRouter(prefix="/api/ideas/100", tags=["idea-100"])

MANAGER_RESPONSE = (
    "We count procedure Y as X when an additional bowel resection is performed. "
    "That local rule adds two cases to Hospital A's qualifying-procedure count."
)


class NoParams(BaseModel):
    pass


@define_tool(
    description="Ask the simulated Hospital A data manager why procedure Y cases were counted as X.",
    skip_permission=True,
)
def ask_local_data_manager(params: NoParams) -> str:
    return MANAGER_RESPONSE


@router.post("/manager-answer")
async def manager_answer(request: AgentRequest) -> AgentResult:
    return await run_agent(
        request,
        system_prompt=(
            "You support a synthetic oncology research data-trust review. Use the "
            "ask_local_data_manager tool to retrieve the simulated explanation, then call "
            "render_ui once with a concise candidate local classification rule and its source. "
            "State clearly that this is a candidate requiring a human's approval. Do not calculate "
            "or change trust scores, infer wrongdoing, or present this as clinical advice."
        ),
        prompt=(
            f"{request.task}\n\nHospital A reports 30 qualifying procedures; Hospital B reports 29. "
            "Hospital A is exactly at a reporting threshold. Explain the manager's local definition "
            "and what should be reviewed before comparing the hospitals."
        ),
        extra_tools=[ask_local_data_manager],
    )
