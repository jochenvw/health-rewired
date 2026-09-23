from pydantic import BaseModel, Field


class IdeaRequest(BaseModel):
    idea: str = Field(..., min_length=10, max_length=2000)
