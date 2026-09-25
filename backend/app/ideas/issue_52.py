"""Idea 52 – an MDT decision patients and GPs understand.

After the tumour board, the nurse specialist opens the case, picks the patient's language and
reading level, and the Copilot SDK agent drafts:

* the explanation for the patient, one sentence at a time, each linked to the source report,
* the GP letter (German) that must say the same thing,
* comprehension-check questions for the consultation.

Nothing is sent before the clinician edits and approves it. Without a Copilot token the same
walkthrough runs on the deterministic drafts in ``issue_52_drafts.py``.
"""

import json
from collections.abc import Callable
from typing import Any, Literal

from copilot import define_tool
from copilot.tools import Tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, run_agent
from app.agent.models import TraceStep
from app.agent.ui import inline_schema
from app.ideas.issue_52_drafts import DRAFTS

router = APIRouter(prefix="/api/ideas/52", tags=["idea-52"])

Language = Literal["nl", "it", "en"]
ReadingLevel = Literal["simple", "detailed"]

LANGUAGE_LABELS: dict[str, str] = {
    "nl": "Nederlands (Dutch)",
    "it": "Italiano (Italian)",
    "en": "English",
}

READING_LEVEL_LABELS: dict[str, str] = {
    "simple": "Simple (short sentences, ~B1)",
    "detailed": "Detailed (full explanation, numbers)",
}

# The synthetic post-MDT cases this idea works on. Source ids are what every sentence links to.
CASES: dict[str, dict[str, Any]] = {
    "P-010": {
        "board": "Colorectal tumour board · 10 Mar 2026",
        "decision": "Shared decision: watch-and-wait or total mesorectal excision",
        "consultation": "Decision consultation · nurse specialist · Room 4 · today 11:20",
        "sources": [
            {"id": "mdt", "title": "MDT conclusion – 10 Mar 2026", "path": "notes/P-010-mdt-conclusion.md"},
            {"id": "mri", "title": "MRI rectum restaging – 4 Mar 2026", "path": "notes/P-010-mri-restaging.md"},
            {"id": "pathology", "title": "Pathology – biopsies scar – 5 Mar 2026", "path": "notes/P-010-pathology.md"},
        ],
        "options": [
            {
                "name": "Watch-and-wait (organ preservation)",
                "benefit": "No operation now, no stoma, own bowel function kept",
                "drawback": "MRI + endoscopy every 3 months; regrowth in ~1 in 4 patients",
                "source_id": "mdt",
            },
            {
                "name": "Total mesorectal excision (surgery)",
                "benefit": "Highest certainty about residual disease",
                "drawback": "Major surgery, usually a temporary stoma, bowel/sexual dysfunction risk",
                "source_id": "mdt",
            },
        ],
    },
    "P-011": {
        "board": "Gastrointestinal tumour board · 11 Mar 2026",
        "decision": "FOLFOX + panitumumab, liver MRI after 4 cycles, then re-discuss liver surgery",
        "consultation": "Treatment explanation · nurse specialist + interpreter · Room 2 · today 14:00",
        "sources": [
            {"id": "mdt", "title": "MDT conclusion – 11 Mar 2026", "path": "notes/P-011-mdt-conclusion.md"},
            {"id": "imaging", "title": "CT staging + liver MRI", "path": "notes/P-011-ct-report.md"},
            {"id": "pathology", "title": "Pathology – sigmoid biopsy", "path": "notes/P-011-pathology.md"},
        ],
        "options": [
            {
                "name": "FOLFOX + panitumumab (chosen by the board)",
                "benefit": "Best chance of shrinking the liver metastases enough to operate later",
                "drawback": "Fatigue, cold-induced tingling, skin rash, low white cells",
                "source_id": "mdt",
            },
            {
                "name": "Upfront liver surgery",
                "benefit": "Would remove the metastases immediately",
                "drawback": "Not technically possible today: two lesions abut the right hepatic vein",
                "source_id": "imaging",
            },
        ],
    },
}

SYSTEM_PROMPT = """\
You prepare the conversation after an oncology multidisciplinary team (MDT) meeting.
All data is SYNTHETIC. You never add prognosis, numbers or treatment advice that is not in the
source documents, and you never take a decision: the clinician edits and approves everything.

Work like this:
1. Call `get_mdt_case` to read the MDT conclusion, the pathology and imaging reports and the
   patient's language and reading level.
2. Write the explanation for the patient in the requested language and reading level, as separate
   short sentences. Cover: what was found, what it means, which options exist, the benefits and
   drawbacks of each, and what happens next.
3. Write the GP letter in German, medically precise, saying exactly the same things as the patient
   version - no extra conclusions.
4. Write three comprehension-check questions in the patient's language with the answer you expect
   to hear.
5. Every sentence must carry the `source_id` of the document it comes from. Flag sentences that are
   easily misunderstood with `risk` (in English, for the clinician).
6. Finish by calling `save_explanation` exactly once. Do not call `render_ui`.
"""


class CaseSource(BaseModel):
    id: str
    title: str
    path: str
    text: str


class CaseOption(BaseModel):
    name: str
    benefit: str
    drawback: str
    source_id: str


class CaseResponse(BaseModel):
    patient_id: str
    name: str
    age: int
    sex: str
    diagnosis: str
    stage: str
    board: str
    decision: str
    consultation: str
    communication: dict[str, Any]
    options: list[CaseOption]
    sources: list[CaseSource]
    timeline: list[dict[str, str]]
    open_questions: list[str]


class DraftSentence(BaseModel):
    text: str = Field(description="One short sentence, in the requested language and reading level")
    source_id: str = Field(description="Id of the source document this sentence is based on")
    risk: str | None = Field(
        default=None,
        description="If the sentence is easily misunderstood, explain why in English for the clinician",
    )


class DraftQuestion(BaseModel):
    question: str = Field(description="Comprehension-check question in the patient's language")
    expected_answer: str = Field(description="The answer you expect to hear back")


class ExplanationDraft(BaseModel):
    """Params of the terminal tool: the whole post-MDT package."""

    headline: str = Field(description="One line naming the patient and the decision")
    patient_sentences: list[DraftSentence] = Field(description="Explanation for the patient, in display order")
    gp_sentences: list[DraftSentence] = Field(description="German letter to the GP, in display order")
    questions: list[DraftQuestion] = Field(description="Three comprehension-check questions")


class Sentence(BaseModel):
    id: str
    text: str
    source_id: str
    source_title: str
    risk: str | None = None


class ExplainRequest(BaseModel):
    patient_id: str = Field(pattern=r"^[A-Za-z0-9-]{1,32}$")
    language: Language = "nl"
    reading_level: ReadingLevel = "simple"


class ExplainResponse(BaseModel):
    mode: Literal["copilot", "fallback"]
    patient_id: str
    language: str
    language_label: str
    reading_level: str
    headline: str
    patient_sentences: list[Sentence]
    gp_sentences: list[Sentence]
    questions: list[DraftQuestion]
    trace: list[TraceStep] = Field(default_factory=list)
    note: str | None = None


def _case(patient_id: str) -> dict[str, Any]:
    case = CASES.get(patient_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"No post-MDT case for {patient_id}")
    return case


def _sources(case: dict[str, Any]) -> list[CaseSource]:
    return [CaseSource(**source, text=sample_data.read_text(source["path"])) for source in case["sources"]]


def _build_case(patient_id: str) -> CaseResponse:
    case = _case(patient_id)
    record = sample_data.get_patient(patient_id)
    diagnosis = record.get("diagnosis", {})
    return CaseResponse(
        patient_id=patient_id,
        name=record["name"],
        age=record["age"],
        sex=record["sex"],
        diagnosis=diagnosis.get("primary", ""),
        stage=diagnosis.get("stage", ""),
        board=case["board"],
        decision=case["decision"],
        consultation=case["consultation"],
        communication=record.get("communication", {}),
        options=[CaseOption(**option) for option in case["options"]],
        sources=_sources(case),
        timeline=record.get("timeline", []),
        open_questions=record.get("open_questions", []),
    )


@router.get("/cases")
async def list_cases() -> list[dict[str, Any]]:
    """The post-MDT consultations waiting for an explanation."""
    cases = []
    for patient_id, case in CASES.items():
        record = sample_data.get_patient(patient_id)
        communication = record.get("communication", {})
        cases.append(
            {
                "patient_id": patient_id,
                "name": record["name"],
                "age": record["age"],
                "diagnosis": record.get("diagnosis", {}).get("primary", ""),
                "board": case["board"],
                "decision": case["decision"],
                "consultation": case["consultation"],
                "language": communication.get("preferred_language"),
                "language_label": communication.get("preferred_language_label"),
                "reading_level": communication.get("reading_level"),
                "interpreter_needed": communication.get("interpreter_needed", False),
            }
        )
    return cases


@router.get("/case/{patient_id}")
async def get_case(patient_id: str) -> CaseResponse:
    return _build_case(patient_id)


class _CaseParams(BaseModel):
    patient_id: str = Field(description="Synthetic patient id of the post-MDT case, e.g. 'P-010'")


def _build_case_tool(language: str, reading_level: str) -> Tool:
    def get_mdt_case(params: _CaseParams) -> str:
        try:
            case = _build_case(params.patient_id)
        except HTTPException:
            return json.dumps({"error": "unknown case", "known": list(CASES)})
        payload = case.model_dump()
        payload["requested_language"] = LANGUAGE_LABELS.get(language, language)
        payload["requested_language_code"] = language
        payload["requested_reading_level"] = READING_LEVEL_LABELS.get(reading_level, reading_level)
        return json.dumps(payload)

    return define_tool(
        "get_mdt_case",
        description=(
            "Read one synthetic post-MDT case: patient, language preference, MDT conclusion, "
            "pathology and imaging reports, and the treatment options with their source ids."
        ),
        handler=get_mdt_case,
        params_type=_CaseParams,
        skip_permission=True,
    )


def _build_save_tool(sink: Callable[[ExplanationDraft], None]) -> Tool:
    def save_explanation(params: ExplanationDraft) -> str:
        sink(params)
        return "Saved as a draft for the clinician to edit and approve."

    tool = define_tool(
        "save_explanation",
        description=(
            "Hand the draft explanation, GP letter and comprehension questions to the clinician. "
            "Call this exactly once at the end. Nothing is sent to the patient by this tool."
        ),
        handler=save_explanation,
        params_type=ExplanationDraft,
        skip_permission=True,
        is_terminal=True,
    )
    tool.parameters = inline_schema(dict(tool.parameters or {}))
    return tool


def _titles(case: dict[str, Any]) -> dict[str, str]:
    return {source["id"]: source["title"] for source in case["sources"]}


def _sentences(raw: list[dict[str, Any]], prefix: str, titles: dict[str, str]) -> list[Sentence]:
    return [
        Sentence(
            id=f"{prefix}{index + 1}",
            text=item["text"],
            source_id=item.get("source_id", ""),
            source_title=titles.get(item.get("source_id", ""), "Source not linked"),
            risk=item.get("risk"),
        )
        for index, item in enumerate(raw)
    ]


def _fallback(request: ExplainRequest, note: str) -> ExplainResponse:
    case = _case(request.patient_id)
    drafts = DRAFTS[request.patient_id]
    languages = drafts["languages"]
    language = request.language if request.language in languages else next(iter(languages))
    per_language = languages[language]
    titles = _titles(case)
    return ExplainResponse(
        mode="fallback",
        patient_id=request.patient_id,
        language=language,
        language_label=LANGUAGE_LABELS.get(language, language),
        reading_level=request.reading_level,
        headline=drafts["headline"].get(language, case["decision"]),
        patient_sentences=_sentences(per_language[request.reading_level], "p", titles),
        gp_sentences=_sentences(drafts["gp"], "g", titles),
        questions=[DraftQuestion(**question) for question in per_language["questions"]],
        trace=[TraceStep(tool="get_mdt_case", arguments=request.patient_id)],
        note=note,
    )


@router.post("/explain")
async def explain(request: ExplainRequest) -> ExplainResponse:
    """Draft the patient explanation, the GP letter and the comprehension questions."""
    case = _case(request.patient_id)
    captured: list[ExplanationDraft] = []
    tools = [_build_case_tool(request.language, request.reading_level), _build_save_tool(captured.append)]
    task = (
        f"Prepare the post-MDT explanation for {request.patient_id} in "
        f"{LANGUAGE_LABELS.get(request.language, request.language)} at reading level "
        f"'{READING_LEVEL_LABELS.get(request.reading_level, request.reading_level)}', "
        "plus the German GP letter and three comprehension questions."
    )
    result = await run_agent(
        AgentRequest(task=task, patient_id=request.patient_id, role="Oncology nurse specialist"),
        system_prompt=SYSTEM_PROMPT,
        prompt=f"{task}\nStart by calling get_mdt_case for {request.patient_id}.",
        extra_tools=tools,
    )

    if not captured:
        reason = result.note or "The assistant did not return a draft."
        return _fallback(request, f"Showing the prepared demo draft. {reason}")

    draft = captured[-1]
    titles = _titles(case)
    return ExplainResponse(
        mode="copilot",
        patient_id=request.patient_id,
        language=request.language,
        language_label=LANGUAGE_LABELS.get(request.language, request.language),
        reading_level=request.reading_level,
        headline=draft.headline,
        patient_sentences=_sentences([s.model_dump() for s in draft.patient_sentences], "p", titles),
        gp_sentences=_sentences([s.model_dump() for s in draft.gp_sentences], "g", titles),
        questions=draft.questions,
        trace=result.trace,
    )
