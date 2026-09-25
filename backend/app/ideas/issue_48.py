"""Issue #48 – confirm once at the source, reuse everywhere.

One synthetic patient with metastatic colorectal cancer whose documents come from four fictional
hospitals in Dutch, French, German and Italian. The minimal dataset is extracted from those
documents with the source sentence, a translation and a confidence per value; contradictions and
missing values are flagged instead of guessed. The clinician accepts, corrects or marks a value
"unknown", after which it flows into the MDT overview, the cancer registration and the research
dataset. A scorecard compares the confirmed values against a hidden answer key.
"""

import json

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.ui import UIBlock, UIItem
from app.config import settings

router = APIRouter(prefix="/api/ideas/48", tags=["idea-48"])

DATA_PATH = "mdt-minimal-dataset/{patient_id}.json"

SYSTEM_PROMPT = """\
You support an MDT coordinator preparing a tumour board in the Oncology Hackathon 2026 Munich demo.
All data is SYNTHETIC. You read multilingual clinical documents (Dutch, French, German, Italian)
and explain the minimal dataset that was extracted from them.

Rules:
- Quote the original sentence and its translation as evidence; name the document as `source`.
- Put contradictions and missing values first, as an `alert` block with severity.
- Never fill in a missing value or convert a described function ("goed zelfredzaam") into a score.
  Say it stays "unknown" until a clinician decides.
- End with an `actions` block: what the clinician should confirm, correct or mark unknown.
- Keep it short and clinical. Finish by calling `render_ui` exactly once.
"""


class DocsParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id, e.g. 'P-048'")


@define_tool(
    description=(
        "Get the multilingual source documents and the extracted minimal dataset (values, "
        "evidence sentences, translations, confidence, conflicts) for one synthetic patient."
    ),
    skip_permission=True,
)
def get_minimal_dataset(params: DocsParams) -> str:
    try:
        record = _load(params.patient_id)
    except FileNotFoundError:
        return json.dumps({"error": "unknown patient", "known": ["P-048"]})
    return json.dumps({k: v for k, v in record.items() if k != "answer_key"})


class AgentBody(BaseModel):
    patient_id: str = Field(default="P-048", pattern=r"^[A-Za-z0-9-]{1,32}$")
    task: str = Field(min_length=3, max_length=4000)


class Decision(BaseModel):
    field_id: str
    value: str
    action: str = "accepted"


class ScorecardBody(BaseModel):
    patient_id: str = Field(default="P-048", pattern=r"^[A-Za-z0-9-]{1,32}$")
    decisions: list[Decision] = Field(default_factory=list)


def _load(patient_id: str) -> dict:
    return sample_data.read(DATA_PATH.format(patient_id=patient_id))


@router.get("/dataset/{patient_id}")
async def dataset(patient_id: str) -> dict:
    """Deterministic extraction result: the whole screen, minus the hidden answer key."""
    try:
        record = _load(patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Unknown synthetic patient") from exc
    fields = record["fields"]
    return {
        **{k: v for k, v in record.items() if k != "answer_key"},
        "counts": {
            "total": len(fields),
            "needs_review": sum(1 for f in fields if f["status"] != "ok"),
            "languages": len({d["language"] for d in record["documents"]}),
            "hospitals": len({d["hospital"] for d in record["documents"]}),
        },
    }


@router.post("/scorecard")
async def scorecard(body: ScorecardBody) -> dict:
    """Compare what the clinician confirmed against the hidden answer key."""
    try:
        record = _load(body.patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Unknown synthetic patient") from exc
    key = record["answer_key"]
    labels = {f["id"]: f["label"] for f in record["fields"]}
    rows = []
    for decision in body.decisions:
        expected = key.get(decision.field_id, "")
        if decision.value == expected:
            verdict = "unknown" if decision.value.lower().startswith("unknown") else "correct"
        else:
            verdict = "wrong"
        rows.append(
            {
                "field_id": decision.field_id,
                "label": labels.get(decision.field_id, decision.field_id),
                "confirmed": decision.value,
                "expected": expected,
                "action": decision.action,
                "verdict": verdict,
            }
        )
    return {
        "rows": rows,
        "correct": sum(1 for r in rows if r["verdict"] == "correct"),
        "unknown": sum(1 for r in rows if r["verdict"] == "unknown"),
        "wrong": sum(1 for r in rows if r["verdict"] == "wrong"),
        "total_fields": len(record["fields"]),
    }


def _demo_result(record: dict, note: str) -> AgentResult:
    """Deterministic walkthrough of the same dataset when the Copilot SDK is not available."""
    fields = record["fields"]
    docs = {d["id"]: d for d in record["documents"]}
    flagged = [f for f in fields if f["status"] != "ok"]

    def evidence_items(field: dict) -> list[UIItem]:
        return [
            UIItem(
                label=f"“{e['quote']}”",
                detail=f"{e['translation']} · {field['label']}",
                source=f"{docs[e['doc']]['language']} · {docs[e['doc']]['type']} · {e['doc']}",
            )
            for e in field["evidence"]
        ]

    blocks = [
        UIBlock(
            type="alert",
            title="Contradictions, uncertain and missing values",
            severity="warning",
            items=[
                UIItem(
                    label=f"{f['label']}: {f['proposed']}",
                    detail=f["why"],
                    severity="critical" if f["status"] == "conflict" else "warning",
                )
                for f in flagged
            ],
        ),
        UIBlock(
            type="evidence",
            title="Source sentence and translation behind each flagged value",
            items=[item for f in flagged for item in evidence_items(f)],
        ),
        UIBlock(
            type="actions",
            title="Your decision (nothing is reused until you confirm)",
            items=[
                UIItem(label=f"Accept, correct or mark unknown: {f['label']}", detail=f"Proposed: {f['proposed']}")
                for f in flagged
            ],
        ),
    ]
    return AgentResult(
        mode="fallback",
        headline=f"{len(flagged)} of {len(fields)} values need a human decision",
        blocks=blocks,
        note=note,
    )


@router.post("/agent")
async def agent(body: AgentBody) -> AgentResult:
    """Ask the Copilot SDK agent to explain the extraction for this patient."""
    try:
        record = _load(body.patient_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Unknown synthetic patient") from exc
    if settings.copilot_auth_mode == "not-configured":
        return _demo_result(record, "Copilot SDK not configured: showing the deterministic demo of the same dataset.")
    try:
        return await run_agent(
            AgentRequest(task=body.task, patient_id=body.patient_id, role="MDT coordinator"),
            system_prompt=SYSTEM_PROMPT,
            prompt=(
                f"Patient: {body.patient_id}. Call get_minimal_dataset first.\n"
                f"Task: {body.task}\n"
                "Explain each flagged value with its original sentence and translation, and say what "
                "the clinician must decide."
            ),
            extra_tools=[get_minimal_dataset],
        )
    except Exception:  # noqa: BLE001 - the demo must never break for the participant
        return _demo_result(record, "The assistant was unavailable; showing the deterministic demo instead.")
