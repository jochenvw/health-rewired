"""Generative UI contract.

The agent does not only write text: it calls the ``render_ui`` tool with a list of typed blocks,
and the React frontend renders each block with the matching component
(``frontend/src/blocks/registry.tsx``). To add a block type, extend ``BlockType`` here and add a
component there.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

BlockType = Literal["summary", "patient_card", "timeline", "evidence", "alert", "actions", "cohort"]
Severity = Literal["info", "warning", "critical"]


class UIItem(BaseModel):
    label: str = Field(description="Main text of the item (fact name, event, option, action)")
    detail: str | None = Field(default=None, description="Secondary text: value, explanation or rationale")
    date: str | None = Field(default=None, description="ISO date for timeline items")
    source: str | None = Field(default=None, description="Where this comes from, e.g. a sample-data file")
    severity: Severity | None = None


class UIBlock(BaseModel):
    type: BlockType = Field(
        description=(
            "summary: short narrative. patient_card: key facts as items. timeline: dated items. "
            "evidence: items with sources. alert: something needing attention (set severity). "
            "actions: proposed actions a human must approve, edit or dismiss. "
            "cohort: eligible/ineligible/unknown patient classification for a cohort question, "
            "one item per patient (detail: reasons, source: the record, severity 'warning' for unknown)."
        )
    )
    title: str
    body: str | None = Field(default=None, description="Optional paragraph of plain text")
    severity: Severity | None = None
    items: list[UIItem] = Field(default_factory=list)


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
