"""Inspectable, synthetic colon-case preparation; every output remains a human-only draft."""

import json
import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app import sample_data
from app.agent.models import AgentRequest, AgentResult
from app.agent.runner import run_agent
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/81", tags=["idea-81"])
KEYS = Literal["stage", "mmr", "allergy", "wishes", "ecog", "cea"]
FILES = {
    "labs.csv": "CSV laboratory export",
    "referral-letter.txt": "Word letter — plain-text export (no binary DOCX parser)",
    "staging.fhir.json": "FHIR-style JSON (illustrative)",
    "guideline-examples.json": "Unverified illustrative guideline summaries",
}
SYSTEM_PROMPT = """You support a synthetic colon tumour-board preparation prototype.
Use ONLY the supplied JSON facts, findings and curated illustrative examples. Do not read
other patient records or retrieve additional guidelines. Call render_ui with supplementary
summary/evidence/alert blocks explaining conditional routes and conflicts. Never invent data,
sources, guideline quotations, measured differences, currency or coverage. Missing/pending is
not negative. dMMR does not imply metastatic disease. Do not prescribe or endorse treatment.
Before review, explain only extraction and gaps. After review, explain only the supplied draft.
All outputs: human-only draft, unverified examples, not for clinical use."""


class Fact(BaseModel):
    key: KEYS
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(max_length=300)
    source: str = Field(min_length=1, max_length=300)
    status: Literal["available", "pending", "missing"]

    @model_validator(mode="after")
    def reasonable_value(self):
        if self.status == "missing":
            return self
        allowed = {"stage": {"pending", "localized", "metastatic"}, "mmr": {"pending", "pMMR", "dMMR"}}
        if self.key in allowed and self.value not in allowed[self.key]:
            raise ValueError(f"Unsupported {self.key} value")
        if self.key in allowed and (self.value == "pending") != (self.status == "pending"):
            raise ValueError("Pending values must have pending status; reviewed results must be available")
        if not self.value.strip():
            raise ValueError("A non-missing fact needs a value")
        if self.key == "ecog" and self.value not in {"0", "1", "2", "3", "4"}:
            raise ValueError("ECOG must be 0–4")
        if self.key == "cea" and not re.fullmatch(r"\d+(?:\.\d+)? ng/mL", self.value):
            raise ValueError("CEA must be a non-negative numeric value in ng/mL")
        return self


class Source(BaseModel):
    name: str
    format: str
    content: str


class Coverage(BaseModel):
    label: str
    likely_source: str
    status: Literal["available", "partial", "outside"]


class Finding(BaseModel):
    label: str
    detail: str


class Recommendation(BaseModel):
    id: str
    source: str
    title: str
    detail: str
    used: list[str]
    reference: str
    limitation: str


class PrepareRequest(BaseModel):
    horizon: Literal["future", "six-months"]
    facts: list[Fact] | None = Field(default=None, max_length=6)

    @model_validator(mode="after")
    def unique_keys(self):
        if self.facts is not None and len({fact.key for fact in self.facts}) != len(self.facts):
            raise ValueError("Each reviewed fact key must be unique")
        return self


class PrepareResponse(BaseModel):
    facts: list[Fact]
    recommendations: list[Recommendation]
    missing: list[Finding]
    conflicts: list[Finding]
    agent: AgentResult


class DiscussionMetrics(BaseModel):
    survival: int = Field(ge=0, le=100)
    quality: int = Field(ge=0, le=100)
    mobility: int = Field(ge=0, le=100)
    limitations: int = Field(ge=0, le=100)
    costs: int = Field(ge=0, le=100)


class WeeklyStory(BaseModel):
    week: int = Field(ge=1, le=6)
    fatigue: int = Field(ge=0, le=100)
    visits: int = Field(ge=0)
    recovery: str


class DiscussionOption(BaseModel):
    id: str
    title: str
    condition: str
    plain_language: str
    metrics: DiscussionMetrics
    neuropathy: int = Field(ge=0, le=100)
    trajectory: list[WeeklyStory]
    reasoning: str


class Glossary(BaseModel):
    term: str
    meaning: str
    timeline: str
    reference: str


class DiscussionResponse(BaseModel):
    limitation: str
    eligibility: str
    context: list[Finding]
    options: list[DiscussionOption]
    glossary: list[Glossary]
    evidence: list[Finding]
    agent: AgentResult


def _read(name: str):
    return sample_data.read(f"issue-81/{name}")


def _letter() -> dict[str, str]:
    return {
        key.strip(): value.strip()
        for line in sample_data.read_text("issue-81/referral-letter.txt").splitlines()
        if ": " in line
        for key, value in [line.split(": ", 1)]
    }


def _facts(horizon: str = "future") -> list[Fact]:
    letter = _letter()
    observations = [entry["resource"] for entry in _read("staging.fhir.json")["entry"]]
    cea = next(row for row in _read("labs.csv") if row["test"] == "CEA")
    facts = [
        Fact(
            key=key,
            label=label,
            value=observation["valueString"],
            source=f"staging.fhir.json · Observation/{observation['id']}",
            status="pending" if observation["valueString"] == "pending" else "available",
        )
        for key, label, observation in zip(
            ["stage", "mmr"], ["Clinical stage", "MMR status"], observations, strict=True
        )
    ]
    for key, label in [("allergy", "Allergy"), ("wishes", "Patient wishes"), ("ecog", "ECOG")]:
        unavailable = horizon == "six-months"
        facts.append(
            Fact(
                key=key,
                label=label,
                value="" if unavailable else letter[key],
                source="referral-letter.txt · Clinic assessment"
                if not unavailable
                else "minimal-mdt-dataset.json · no automatic clinic-note inference",
                status="missing" if unavailable else "available",
            )
        )
    facts.append(
        Fact(
            key="cea",
            label="CEA",
            value=f"{cea['value']} {cea['unit']}",
            source="labs.csv · C-081 / CEA",
            status="available",
        )
    )
    return facts


def _coverage() -> list[Coverage]:
    dataset = sample_data.read("minimal-mdt-dataset.json")
    elements = {
        element["name"]: element["likely_source"] for group in dataset["groups"] for element in group["elements"]
    }
    result = []
    for label, field in [
        ("Age", "Age"),
        ("Sex", "Sex"),
        ("Clinical stage", "cTNM"),
        ("MMR / MSI report", "Non-metastatic CRC: MSI"),
        ("ECOG / WHO performance status", "WHO performance status"),
        ("CEA", "CEA"),
        ("Patient wishes", "Patient's treatment preference"),
        ("Allergy", "Allergy"),
    ]:
        source = elements.get(field)
        result.append(
            Coverage(
                label=label,
                likely_source=source or "Not an explicit field in the minimal dataset",
                status="outside"
                if source is None
                else "available"
                if source in {"structured", "derived"}
                else "partial",
            )
        )
    return result


@router.get("/case")
def get_case():
    letter = _letter()
    return {
        "patient": {
            **{key: letter[key] for key in ["id", "name", "sex", "diagnosis"]},
            "age": int(letter["age"]),
            "allergies": "; ".join([letter["allergy"]]),
        },
        "facts": _facts(),
        "sources": [
            Source(name=name, format=format_, content=sample_data.read_text(f"issue-81/{name}"))
            for name, format_ in FILES.items()
        ],
        "coverage": _coverage(),
    }


def _evaluate(facts: list[Fact]):
    available = {fact.key: fact.value for fact in facts if fact.status == "available"}
    dates = {
        entry["resource"]["id"].rsplit("-", 1)[-1]: entry["resource"]["expectedDate"]
        for entry in _read("staging.fhir.json")["entry"]
    }
    missing = []
    for key, label in [
        ("stage", "CT staging"),
        ("mmr", "MMR result"),
        ("allergy", "Allergy review"),
        ("wishes", "Patient wishes"),
        ("ecog", "ECOG"),
        ("cea", "CEA"),
    ]:
        if key not in available:
            detail = "Not supplied or not available; ask the clinician to review rather than infer."
            if key == "stage":
                detail = (
                    f"Synthetic CT expected {dates['stage']}. Until reviewed, localized resection discussion "
                    "versus metastatic multidisciplinary planning remains conditional."
                )
            if key == "mmr":
                detail = (
                    f"Synthetic MMR result expected {dates['mmr']}. A result may change later specialist "
                    "discussion; it cannot establish staging."
                )
            missing.append(Finding(label=label, detail=detail))
    missing.append(
        Finding(
            label="If systemic / adjuvant treatment is discussed later",
            detail="DPD/DPYD assessment and surgical pathology (pTNM and risk features) are not supplied. "
            "Review these if relevant before a later systemic/adjuvant decision; do not assume an indication.",
        )
    )
    conflicts = []
    allergy = available.get("allergy", "")
    # Negation applies only to its penicillin mention, not to other allergies in the note.
    allergy_mentions = re.sub(r"\b(?:no|denies)\s+(?:known\s+)?penicillin\b", "", allergy.lower())
    if re.search(r"\bpenicillin\b", allergy_mentions):
        conflicts.append(
            Finding(
                label="Allergy and perioperative planning",
                detail=f"Reviewed allergy: {allergy}. "
                "Human review of perioperative antibiotics is required; no antibiotic is selected.",
            )
        )
    wishes = available.get("wishes", "")
    if "neuropathy" in wishes.lower():
        conflicts.append(
            Finding(
                label="Patient wish and possible systemic treatment",
                detail=f"Reviewed wishes: {wishes}. "
                "If systemic treatment becomes relevant, discuss neuropathy risk and alternatives "
                "with the patient; this is a potential conflict, not a treatment indication.",
            )
        )
    stage = available.get("stage")
    route = {
        "localized": "Reviewed stage: localized. Discuss resection with the surgical MDT; no operation is ordered.",
        "metastatic": "Reviewed stage: metastatic. Discuss multidisciplinary planning and further characterization; "
        "no regimen is selected.",
    }.get(
        stage,
        "CT staging pending or missing. If localized, discuss resection; if metastatic, discuss "
        "multidisciplinary planning. Neither route is established.",
    )
    mmr = available.get("mmr")
    molecular = {
        "dMMR": "Reviewed MMR: dMMR. Consider optional specialist discussion of molecular implications "
        "in the reviewed stage context; do not infer metastatic disease or prescribe immunotherapy.",
        "pMMR": "Reviewed MMR: pMMR. No dMMR-specific discussion is triggered; stage and later pathology "
        "remain separate decision inputs.",
    }.get(mmr, "MMR pending or missing: molecular-dependent options remain conditional.")
    return missing, conflicts, f"{route} {molecular}"


@router.post("/prepare", response_model=PrepareResponse)
async def prepare(body: PrepareRequest):
    reviewed = body.facts is not None
    facts = body.facts if reviewed else _facts(body.horizon)
    missing, conflicts, route = _evaluate(facts)
    examples = _read("guideline-examples.json")
    recommendations = (
        [
            Recommendation(
                **{key: example[key] for key in ["id", "source", "title", "reference"]},
                detail=f"Human-only draft. {example['summary']} {route}",
                used=[f"{fact.key}: {fact.value} ({fact.source})" for fact in facts if fact.status == "available"],
                limitation=examples["limitation"],
            )
            for example in examples["examples"]
        ]
        if reviewed
        else []
    )
    grounding = {
        "horizon": body.horizon,
        "reviewed": reviewed,
        "facts": [fact.model_dump() for fact in facts],
        "missing": [item.model_dump() for item in missing],
        "conflicts": [item.model_dump() for item in conflicts],
        "recommendations": [item.model_dump() for item in recommendations],
        "illustrative_examples": examples,
    }
    agent = await run_agent(
        AgentRequest(task="Explain this synthetic colon MDT draft and unresolved inputs", role="MDT coordinator"),
        system_prompt=SYSTEM_PROMPT,
        prompt=json.dumps(grounding, ensure_ascii=False),
    )
    if agent.mode == "fallback":
        agent = AgentResult(
            mode="fallback",
            headline="Reviewed colon-case draft" if reviewed else "Extracted facts — clinician review required",
            note=agent.note,
            blocks=[
                UIBlock(
                    type="summary",
                    title="Conditional routes — human-only draft",
                    body=route if reviewed else "Review extracted facts before evaluating the three examples.",
                ),
                UIBlock(
                    type="alert",
                    title="Unresolved inputs",
                    severity="warning",
                    items=[UIItem(label=item.label, detail=item.detail) for item in missing],
                ),
                UIBlock(
                    type="alert",
                    title="Potential conflicts — human review",
                    severity="warning",
                    items=[UIItem(label=item.label, detail=item.detail) for item in conflicts],
                ),
                UIBlock(
                    type="evidence",
                    title="Illustrative examples, not clinical guidance",
                    body=examples["limitation"],
                    items=[UIItem(label=item["source"], source=item["reference"]) for item in examples["examples"]],
                ),
            ],
        )
    return PrepareResponse(
        facts=facts, recommendations=recommendations, missing=missing, conflicts=conflicts, agent=agent
    )


DISCUSSION_PROMPT = """Explain a synthetic shared-decision discussion using ONLY the supplied JSON.
Call render_ui with plain-language summary, evidence and warning alert blocks. All numerical
values are arbitrary author-created demo fixtures, NOT personal probabilities, risk models,
evidence-derived estimates or real treatment effects. Never invent or alter numbers, infer
missing facts, calculate survival benefits, rank options, order care or recommend treatment.
Only the documented future ECOG simulation affects fatigue, limitations, quality and mobility.
Age has no calibrated adjustment. MMR is a tumour result, not inherited genetics; CEA alone
does not establish stage or prognosis. Never read other records or retrieve guidelines.
Both localized scenarios are hypothetical: resection alone if pathology permits, or resection
then adjuvant systemic treatment ONLY IF pathology/MDT indicate. Medicines do not replace surgery.
Pending staging/MMR/pathology remain explicit; options are not selectable prescribed treatments.
If options are empty, explain that this localized example is not applicable and specialist MDT
discussion is required. Explain the weekly stories, glossary and evidence limitations without
quoting guidelines or claiming their URLs validate fixture numbers. Human review remains central."""


@router.post("/discuss", response_model=DiscussionResponse)
async def discuss(body: PrepareRequest):
    if body.facts is None:
        raise HTTPException(status_code=422, detail="Supply an explicit clinician-reviewed facts list.")

    fixture = _read("tradeoffs.json")
    available = {fact.key: fact.value for fact in body.facts if fact.status == "available"}
    stage = available.get("stage")
    mmr = available.get("mmr")
    eligibility = (
        "This localized scenario is not applicable: reviewed staging is metastatic. "
        "Discuss the case with the specialist MDT; no treatment option is offered."
        if stage == "metastatic"
        else (
            "Reviewed staging is localized."
            if stage == "localized"
            else "Staging pending or missing: localized disease is not established."
        )
        + (
            f" Reviewed tumour MMR: {mmr}."
            if mmr
            else " MMR pending or missing: molecular implications remain unknown."
        )
        + " Surgical pathology is pending/not supplied. Both options are hypothetical discussion scenarios, "
        "not selectable as prescribed treatment. Resection alone requires pathology/MDT support; "
        "adjuvant systemic treatment follows resection ONLY IF pathology/MDT indicate it. "
        "Relevant safety assessments remain required."
    )
    ecog = available.get("ecog")
    modified = body.horizon == "future" and ecog is not None and int(ecog) >= 2
    simulation = (
        f"Applied arbitrary future simulation for reviewed ECOG {ecog}: +10 fatigue/limitations, "
        "-10 quality/mobility, clamped to 0–100. Not a clinical prediction."
        if modified
        else "Base fixtures unchanged. "
        + (
            "Six-month mode disables personalized simulation even when ECOG is reviewed; "
            "personalized predictions are unavailable."
            if body.horizon == "six-months"
            else "No available reviewed ECOG of 2–4; missing/pending inputs are never filled."
        )
    )
    context = [
        Finding(
            label="Age",
            detail=f"Age {_letter()['age']} from synthetic C-081 identity; "
            + (
                "mapped patient Age in minimal-mdt-dataset.json (structured). "
                if body.horizon == "six-months"
                else "source referral-letter.txt. "
            )
            + "No calibrated age adjustment is available; age changes no numbers.",
        ),
        Finding(
            label="Genetics / tumour MMR",
            detail=f"Reviewed tumour MMR: {mmr}. Not an inherited genetic diagnosis; "
            "inherited genetics not recorded. No numerical adjustment."
            if mmr
            else "MMR pending or missing in reviewed facts; inherited genetics not recorded. No numerical adjustment.",
        ),
        Finding(label="Comorbidities", detail="Not recorded in this synthetic case; none are inferred."),
    ]
    for key, label in [("ecog", "ECOG"), ("cea", "CEA"), ("allergy", "Allergy"), ("wishes", "Patient wishes")]:
        fact = next((fact for fact in body.facts if fact.key == key), None)
        context.append(
            Finding(
                label=label,
                detail=f"Reviewed: {fact.value} ({fact.source})."
                if fact and fact.status == "available"
                else f"{fact.status.capitalize() if fact else 'Not supplied'} in reviewed facts; not inferred.",
            )
        )
    context.extend(
        [
            Finding(
                label="Simulation applied", detail=simulation if stage != "metastatic" else "No options simulated."
            ),
            Finding(
                label="Interpretation limits",
                detail="CEA and other labs do not generate biomarker or prognosis inferences. "
                "No validated survival or risk-reduction estimates; priorities never change raw scores.",
            ),
            Finding(label="Full simulation recipe", detail=fixture["recipe"]),
        ]
    )
    options = []
    if stage != "metastatic":
        for item in fixture["options"]:
            option = DiscussionOption.model_validate(item)
            if modified:
                option.metrics.limitations = min(100, option.metrics.limitations + 10)
                option.metrics.quality = max(0, option.metrics.quality - 10)
                option.metrics.mobility = max(0, option.metrics.mobility - 10)
                for point in option.trajectory:
                    point.fatigue = min(100, point.fatigue + 10)
            option.reasoning += f" {simulation} Full recipe: {fixture['recipe']}"
            options.append(option)
    evidence = [
        Finding(label="Author-created fixtures", detail=fixture["limitation"]),
        Finding(
            label="Metric definitions",
            detail=" ".join(f"{key}: {value}" for key, value in fixture["metric_definitions"].items()),
        ),
        Finding(label="Full simulation recipe", detail=fixture["recipe"]),
        Finding(
            label="Six-week story",
            detail="All weekly fatigue, visit counts and recovery text are arbitrary story points, "
            "not predicted recovery, a real schedule or evidence-derived comparisons.",
        ),
        Finding(
            label="Guideline source references, not numeric evidence",
            detail="Existing contextual URLs below have not been verified for content, currency or "
            "applicability. No licensed guideline text is reproduced; no URL supports the demo numbers. "
            + " ".join(item["reference"] for item in _read("guideline-examples.json")["examples"]),
        ),
    ]
    grounding = {
        "horizon": body.horizon,
        "reviewed_facts": [fact.model_dump() for fact in body.facts],
        "limitation": fixture["limitation"],
        "eligibility": eligibility,
        "context": [item.model_dump() for item in context],
        "options": [item.model_dump() for item in options],
        "glossary": fixture["glossary"],
        "evidence": [item.model_dump() for item in evidence],
    }
    agent = await run_agent(
        AgentRequest(task="Explain hypothetical colon-case trade-offs in plain language", role="MDT clinician"),
        system_prompt=DISCUSSION_PROMPT,
        prompt=json.dumps(grounding, ensure_ascii=False),
    )
    if agent.mode == "fallback":
        agent = AgentResult(
            mode="fallback",
            headline="Hypothetical colon-case discussion — human review required",
            note=agent.note,
            blocks=[
                UIBlock(type="summary", title="What can be discussed", body=eligibility),
                UIBlock(
                    type="summary",
                    title="Plain-language scenarios",
                    body="These stories invite questions, not a treatment choice.",
                    items=[UIItem(label=option.title, detail=option.plain_language) for option in options],
                ),
                UIBlock(
                    type="alert",
                    title="Arbitrary demo values — not personal outcomes",
                    severity="warning",
                    body=fixture["limitation"],
                ),
                UIBlock(
                    type="evidence",
                    title="Inspectable inputs and simulation",
                    items=[UIItem(label=item.label, detail=item.detail) for item in [*context, *evidence]],
                ),
            ],
        )
    return DiscussionResponse(
        limitation=fixture["limitation"],
        eligibility=eligibility,
        context=context,
        options=options,
        glossary=[Glossary.model_validate(item) for item in fixture["glossary"]],
        evidence=evidence,
        agent=agent,
    )
