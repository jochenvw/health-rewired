"""Copilot support for the synthetic data-trust walkthrough."""

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent import AgentRequest, AgentResult, run_agent
from app.ideas.issue_100_data import build_dataset, discrepancy_summary

router = APIRouter(prefix="/api/ideas/100", tags=["idea-100"])

MANAGER_RESPONSE = (
    "We count procedure Y as X when an additional bowel resection is performed. "
    "That local rule adds two cases to Hospital A's qualifying-procedure count."
)


class NoParams(BaseModel):
    pass


class DatasetAnalysisRequest(BaseModel):
    definition_id: str = Field(default="inclusive", pattern=r"^(strict|inclusive|local)$")
    refined: bool = False


class DatasetExplanationParams(BaseModel):
    hospital_id: str = Field(default="C", pattern=r"^[A-L]$")


@define_tool(
    description="Ask the simulated Hospital A data manager why procedure Y cases were counted as X.",
    skip_permission=True,
)
def ask_local_data_manager(params: NoParams) -> str:
    return MANAGER_RESPONSE


@define_tool(
    description=(
        "Read deterministic synthetic population findings for one hospital, including "
        "rule-sensitive patterns and example evidence. Do not calculate or change any values."
    ),
    skip_permission=True,
)
def read_dataset_discrepancies(params: DatasetExplanationParams) -> str:
    import json

    return json.dumps(discrepancy_summary(params.hospital_id))


@router.get("/dataset")
async def dataset() -> dict:
    return build_dataset()


@router.post("/dataset/analyze")
async def dataset_analysis(request: DatasetAnalysisRequest) -> dict:
    return build_dataset(request.definition_id, request.refined)


@router.post("/dataset-explanation")
async def dataset_explanation(request: AgentRequest) -> AgentResult:
    return await run_agent(
        request,
        system_prompt=(
            "You explain synthetic oncology dataset discrepancies to a researcher. Call "
            "read_dataset_discrepancies and ground every factual statement in its output. Never "
            "calculate or invent counts, percentages, scores or clinical conclusions. Explain one "
            "recurring semantic pattern and identify a representative synthetic case. Use neutral "
            "language such as 'classification pattern warrants review'; do not imply wrongdoing. "
            "End by asking the researcher what shared definition they want to apply."
        ),
        prompt=(
            f"{request.task}\n\nUse the deterministic findings for the selected hospital. Explain "
            "which local interpretation is driving the difference and what the researcher can inspect."
        ),
        extra_tools=[read_dataset_discrepancies],
    )


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
