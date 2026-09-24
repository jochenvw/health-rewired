"""Generative UI contract.

The agent does not only write text: it calls the ``render_ui`` tool with a list of typed blocks,
and the React frontend renders each block with the matching component
(``frontend/src/blocks/registry.tsx``). To add a block type, extend ``BlockType`` here and add a
component there.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

BlockType = Literal["summary", "patient_card", "timeline", "evidence", "alert", "actions", "specialist_debate"]
Severity = Literal["info", "warning", "critical"]
Confidence = Literal["low", "medium", "high"]
ConsensusGroup = Literal["agreed", "disputed", "missing", "human_decision"]


class UIItem(BaseModel):
    label: str = Field(description="Main text of the item (fact name, event, option, action)")
    detail: str | None = Field(default=None, description="Secondary text: value, explanation or rationale")
    date: str | None = Field(default=None, description="ISO date for timeline items")
    source: str | None = Field(default=None, description="Where this comes from, e.g. a sample-data file")
    severity: Severity | None = None
    group: ConsensusGroup | None = Field(
        default=None,
        description=(
            "Only for specialist_debate consensus items: 'agreed', 'disputed', 'missing' (before MDT) "
            "or 'human_decision' (what the board must decide)."
        ),
    )


class SpecialistView(BaseModel):
    role: str = Field(description="Specialist role, e.g. 'Oncologist', 'Radiologist', 'Pathologist'")
    hypothesis: str = Field(description="This specialist's initial read/hypothesis on the case")
    evidence: str = Field(description="The finding(s) this hypothesis rests on")
    confidence: Confidence = Field(description="How confident this specialist is in their hypothesis")
    source: str | None = Field(default=None, description="Where the evidence comes from, e.g. a sample-data file")


class ChallengeView(BaseModel):
    challenger: str = Field(description="Role of the specialist raising the challenge")
    challenged: str = Field(description="Role of the specialist whose hypothesis is being challenged")
    contested_evidence: str = Field(description="The specific finding or claim being disputed")
    detail: str = Field(description="Why the challenger disagrees, and what it would change")
    resolved: bool = Field(default=False, description="Whether this disagreement has since been resolved")


class UIBlock(BaseModel):
    type: BlockType = Field(
        description=(
            "summary: short narrative. patient_card: key facts as items. timeline: dated items. "
            "evidence: items with sources. alert: something needing attention (set severity). "
            "actions: proposed actions a human must approve, edit or dismiss. specialist_debate: "
            "specialists with hypotheses, their challenges to each other, and a consensus board "
            "(items with `group` set to agreed/disputed/missing/human_decision)."
        )
    )
    title: str
    body: str | None = Field(default=None, description="Optional paragraph of plain text")
    severity: Severity | None = None
    items: list[UIItem] = Field(default_factory=list)
    specialists: list[SpecialistView] = Field(
        default_factory=list, description="Only for specialist_debate: one entry per specialist persona"
    )
    challenges: list[ChallengeView] = Field(
        default_factory=list, description="Only for specialist_debate: direct disagreements between specialists"
    )


class RenderUIParams(BaseModel):
    headline: str = Field(description="One-line headline for the whole view")
    blocks: list[UIBlock] = Field(description="Blocks in display order; choose only blocks that help this user")


def inline_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Inline ``$defs`` references so tool schemas are self-contained for every model."""
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if ref and ref.startswith("#/$defs/"):
                return resolve(dict(defs[ref.split("/")[-1]]))
            return {key: resolve(value) for key, value in node.items()}
        if isinstance(node, list):
            return [resolve(item) for item in node]
        return node

    return resolve(schema)
