from typing import Literal

from pydantic import BaseModel, Field


class Widget(BaseModel):
    kind: str = Field(..., description="Type of UI card or panel to render")
    title: str
    body: str
    meta: str | None = None


class IdeaRequest(BaseModel):
    idea: str = Field(..., min_length=10, max_length=2000)


class CoachingResponse(BaseModel):
    status: str = "ready"
    title: str = "Idea brief"
    summary: str
    next_steps: list[str] = []
    evidence: list[str] = []
    widgets: list[Widget] = []
    idea: str
    sdk_status: str = "ready"


class SourceFact(BaseModel):
    id: str
    label: str
    value: str
    source: str


class PatientCase(BaseModel):
    id: str
    synthetic: bool = True
    patient_name: str
    age: int = Field(..., ge=0, le=130)
    diagnosis: str
    decision_question: str
    facts: list[SourceFact]
    contact: str


class DecisionAction(BaseModel):
    action: str
    owner: str
    due: str


class MDODecision(BaseModel):
    outcomes: list[str] = Field(..., min_length=1)
    rationale: str = Field(..., min_length=1)
    disagreements: str = ""
    unresolved_questions: str = ""
    missing_evidence: str = ""
    actions: list[DecisionAction] = Field(..., min_length=1)
    status: Literal["draft", "approved"] = "draft"
    override_missing: bool = False
    approved_by: str | None = None


class CommunicationPreferences(BaseModel):
    literacy: Literal["simple", "standard", "detailed"] = "standard"
    language: str = "English"
    age_appropriate: bool = True
    accessibility: str = "None"
    read_aloud: bool = False


class GenerationRequest(BaseModel):
    case: PatientCase
    decision: MDODecision
    preferences: CommunicationPreferences = CommunicationPreferences()


class VoiceRequest(BaseModel):
    role: str
    text: str = Field(..., min_length=1, max_length=2000)
