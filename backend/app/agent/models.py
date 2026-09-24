from typing import Literal

from pydantic import BaseModel, Field

from app.agent.ui import UIBlock


class AgentRequest(BaseModel):
    task: str = Field(min_length=3, max_length=4000)
    patient_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{1,32}$")
    role: str | None = Field(default=None, max_length=80)
    # Cohort-explorer question (issue #27): when trial_id is set, the agent builds a real-world
    # cohort instead of a single-patient view. `simulate` reruns it with fictional follow-up data.
    trial_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{1,32}$")
    treatment: str | None = Field(default=None, max_length=200)
    subgroup: str | None = Field(default=None, max_length=200)
    outcome: str | None = Field(default=None, max_length=200)
    simulate: bool = False


class TraceStep(BaseModel):
    tool: str
    arguments: str | None = None


class AgentResult(BaseModel):
    mode: Literal["copilot", "fallback"]
    headline: str
    blocks: list[UIBlock]
    trace: list[TraceStep] = Field(default_factory=list)
    note: str | None = None
