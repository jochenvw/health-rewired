"""Tools the Copilot SDK agent can call.

Add a tool: define a Pydantic params model, write a function decorated with ``@define_tool``,
and add it to ``DATA_TOOLS``. The model sees the description and the JSON schema of the params.
"""

import json
from collections.abc import Callable

from copilot import define_tool
from copilot.tools import Tool
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import cohort
from app.agent.ui import RenderUIParams, inline_schema


class NoParams(BaseModel):
    pass


class PathParams(BaseModel):
    path: str = Field(description="Relative path inside /sample-data, e.g. 'patients/P-001.json'")


class PatientParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-001'")


class CohortQuestionParams(BaseModel):
    trial_id: str = Field(description="Synthetic trial id from trials.csv, e.g. 'SYN-LU-310'")
    outcome: str = Field(description="Outcome to describe, e.g. 'lab trend', 'imaging', 'patient-reported symptoms'")


class BuildCohortParams(CohortQuestionParams):
    treatment: str = Field(description="Treatment named by the researcher, e.g. 'osimertinib'")
    subgroup: str = Field(description="Patient subgroup named by the researcher, e.g. 'EGFR-mutant NSCLC'")


class SimulateFollowupParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id to generate one fictional follow-up record for")


@define_tool(description="List all synthetic sample-data files (patients, notes, trials).", skip_permission=True)
def list_sample_data(params: NoParams) -> str:
    return json.dumps(sample_data.list_files())


@define_tool(description="Read one synthetic sample-data file by relative path.", skip_permission=True)
def read_sample_data(params: PathParams) -> str:
    try:
        return sample_data.read_text(params.path)
    except FileNotFoundError:
        return f"No sample-data file '{params.path}'. Call list_sample_data first."


@define_tool(description="Get the full synthetic record for one patient.", skip_permission=True)
def get_patient(params: PatientParams) -> str:
    try:
        return json.dumps(sample_data.get_patient(params.patient_id))
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient", "known": sample_data.list_patients()})


@define_tool(
    description=(
        "Propose explicit, human-readable cohort rules (treatment/trial, subgroup, outcome window) for a "
        "researcher to approve before building a real-world cohort. Does not classify any patient yet."
    ),
    skip_permission=True,
)
def propose_cohort_rules(params: CohortQuestionParams) -> str:
    try:
        rules, trial = cohort.propose_rules(params.trial_id, params.outcome)
    except KeyError:
        return json.dumps({"error": "unknown trial_id", "known": [t["trial_id"] for t in cohort.list_trials()]})
    return json.dumps({"rules": rules, "trial": trial})


@define_tool(
    description=(
        "Build and classify a synthetic real-world cohort for an approved treatment/subgroup/outcome question: "
        "every patient becomes eligible, ineligible or unknown against the trial's structured criteria, each "
        "with reasons and a source record, plus a short descriptive (non-causal) outcome per patient."
    ),
    skip_permission=True,
)
def build_cohort(params: BuildCohortParams) -> str:
    try:
        result = cohort.build_cohort(params.trial_id, params.treatment, params.subgroup, params.outcome)
    except KeyError:
        return json.dumps({"error": "unknown trial_id", "known": [t["trial_id"] for t in cohort.list_trials()]})
    return json.dumps(
        {
            "trial_id": result.trial_id,
            "trial_title": result.trial_title,
            "rules": result.rules,
            "counts": result.counts,
            "caveat": result.caveat,
            "patients": [
                {
                    "patient_id": p.patient_id,
                    "name": p.name,
                    "status": p.status,
                    "reasons": p.reasons,
                    "outcome_summary": p.outcome_summary,
                    "outcome_missing": p.outcome_missing,
                    "source": p.source,
                }
                for p in result.patients
            ],
        }
    )


@define_tool(
    description=(
        "Add one fictional follow-up lab record for a patient (in-memory only, never written to /sample-data) "
        "so the cohort question can be rerun to see whether the finding still holds."
    ),
    skip_permission=True,
)
def simulate_followup(params: SimulateFollowupParams) -> str:
    try:
        return json.dumps(cohort.simulate_followup(params.patient_id))
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient", "known": sample_data.list_patients()})


DATA_TOOLS: list[Tool] = [
    list_sample_data,
    read_sample_data,
    get_patient,
    propose_cohort_rules,
    build_cohort,
    simulate_followup,
]


def build_render_ui_tool(sink: Callable[[RenderUIParams], None]) -> Tool:
    """The generative-UI tool. Calling it ends the agent turn and hands the blocks to the frontend."""

    def render_ui(params: RenderUIParams) -> str:
        sink(params)
        return "Rendered."

    tool = define_tool(
        "render_ui",
        description=(
            "Show the result to the user as UI blocks. Always finish by calling this exactly once. "
            "Choose the block types that best fit the user's role and task."
        ),
        handler=render_ui,
        params_type=RenderUIParams,
        skip_permission=True,
        is_terminal=True,
    )
    tool.parameters = inline_schema(dict(tool.parameters or {}))
    return tool
