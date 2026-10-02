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
from app.agent.ui import RenderUIParams, inline_schema


class NoParams(BaseModel):
    pass


class PathParams(BaseModel):
    path: str = Field(description="Relative path inside /sample-data, e.g. 'patients/P-001.json'")


class PatientParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-001'")


@define_tool(
    description="List available sample-data files (synthetic patients, notes, trials, and hospital directory).",
    skip_permission=True,
)
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


DATA_TOOLS: list[Tool] = [list_sample_data, read_sample_data, get_patient]


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
