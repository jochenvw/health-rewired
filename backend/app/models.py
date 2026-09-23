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
