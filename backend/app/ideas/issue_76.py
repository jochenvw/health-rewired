"""Physician-triggered colon MDT preparation with bounded, illustrative evidence."""

import json
import re
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/76", tags=["Colon MDT preparation"])
Horizon = Literal["future", "six-month"]
FactStatus = Literal["recorded", "pending", "missing", "unavailable"]


class Fact(BaseModel):
    key: str
    label: str
    value: str
    source: str
    status: FactStatus


class ExtractRequest(BaseModel):
    patient_id: str
    horizon: Horizon = "future"


class RecommendRequest(ExtractRequest):
    facts: list[Fact]
    reviewed: bool


class Recommendation(BaseModel):
    id: str
    title: str
    options: list[str]
    rationale: str
    used_facts: list[str]
    missing: list[str]
    source_ids: list[str]


class MissingItem(BaseModel):
    field: str
    status: FactStatus
    source: str
    action: str


class ExtractResult(BaseModel):
    patient_id: str
    horizon: Horizon
    facts: list[Fact]
    agent: AgentResult


class Assessment(BaseModel):
    facts: list[Fact]
    recommendations: list[Recommendation]
    missing: list[MissingItem]
    conflicts: list[str]
    agent: AgentResult


def _fixture() -> dict:
    return sample_data.read("colon-mdt-guidelines.json")


def _patient(patient_id: str) -> dict:
    for patient in _fixture()["patients"]:
        if patient["id"] == patient_id:
            return patient
    raise HTTPException(404, "Unknown synthetic colon patient")


def _coverage() -> dict:
    dataset = sample_data.read("minimal-mdt-dataset.json")
    index = {
        element["name"]: (group["group"], element["likely_source"])
        for group in dataset["groups"]
        for element in group["elements"]
    }
    elements = []
    for definition in _fixture()["field_definitions"]:
        match = index.get(definition["dataset_element"])
        likely_source = match[1] if match else None
        availability = (
            "unavailable"
            if not match or likely_source == "patient / clinic note"
            else "available"
            if likely_source in {"structured", "derived"}
            else "partial"
        )
        elements.append(
            {
                **definition,
                "group": match[0] if match else None,
                "likely_source": likely_source,
                "availability": availability,
                "reason": (
                    "Not a dedicated element in the minimal dataset."
                    if not match
                    else "Clinic-note element: unavailable in this six-month demonstration."
                    if availability == "unavailable"
                    else "Requires hospital report structuring; gaps remain visible."
                    if availability == "partial"
                    else "Mapped structured field."
                ),
            }
        )
    return {
        "title": dataset["title"],
        "source": "sample-data/minimal-mdt-dataset.json",
        "assumption": dataset["how_to_read"]["likely_source"],
        "elements": elements,
        "included": sum(e["dataset_element"] in index for e in elements),
        "total": len(elements),
        "hospital_actions": [
            "Map tumour site, morphology, surgery status and renal function to agreed fields.",
            "Structure staging, pathology, resection margins and MSI/MMR report results, including pending status.",
            "Have the physician review extracted facts and confirm locally applicable guideline versions.",
            "Collect allergies, fitness and patient preferences separately before treatment decisions.",
        ],
    }


@router.get("/workspace")
def workspace() -> dict:
    fixture = _fixture()
    coverage = _coverage()
    return {
        "patients": [{k: v for k, v in p.items() if k != "facts"} for p in fixture["patients"]],
        "sources": [
            {
                **source,
                "name": source["title"],
                "version": "Edition and currency not verified",
            }
            for source in fixture["sources"]
        ],
        "coverage": coverage,
        "disclaimer": fixture["disclaimer"],
    }


def _facts(patient: dict, horizon: Horizon) -> list[Fact]:
    definitions = {d["key"]: d for d in _fixture()["field_definitions"]}
    unavailable = {e["key"] for e in _coverage()["elements"] if e["availability"] == "unavailable"}
    facts = []
    for raw in patient["facts"]:
        fact = Fact(**raw, label=definitions[raw["key"]]["label"])
        if horizon == "six-month" and fact.key in unavailable:
            fact = fact.model_copy(
                update={
                    "value": "Unavailable in the minimal-dataset demonstration",
                    "source": "sample-data/minimal-mdt-dataset.json",
                    "status": "unavailable",
                }
            )
        facts.append(fact)
    return facts


async def _agent(task: str, patient_id: str, payload: dict, blocks: list[UIBlock]) -> AgentResult:
    class NoParams(BaseModel):
        pass

    @define_tool(
        "review_colon_mdt_context",
        description="Read the bounded synthetic facts, missing results, conflicts and illustrative source limitations.",
        skip_permission=True,
    )
    def review_context(params: NoParams) -> str:
        return json.dumps(payload)

    result = await run_agent(
        AgentRequest(task=f"{task} ({patient_id})", role="Physician preparing the colon MDT"),
        system_prompt=(
            "You assist a physician with primary colon cancer MDT preparation, not autonomous treatment. "
            "Call review_colon_mdt_context. Only use its supplied synthetic facts and illustrative summaries. "
            "Never claim retrieved, verified, latest or current full-text guidelines, invented sections or doses. "
            "Pending/absent results cannot establish M0, safety or absence of conflicts. "
            "Do not consult other records or make new medical claims. Finish with render_ui, choosing from the "
            "supplied block titles, types and content; you may reorder them for the physician."
        ),
        prompt=f"{task}. Context and allowed UI blocks: "
        + json.dumps({"context": payload, "blocks": [block.model_dump() for block in blocks]}),
        extra_tools=[review_context],
    )
    # The SDK chooses presentation, but cannot promote invented guideline claims into the assessment.
    selected = [block.title for block in result.blocks] if result.mode == "copilot" else []
    by_title = {block.title: block for block in blocks}
    ordered_titles = list(dict.fromkeys([title for title in selected if title in by_title] + list(by_title)))
    return AgentResult(
        mode=result.mode,
        headline=task,
        blocks=[by_title[title] for title in ordered_titles],
        trace=(
            result.trace
            if result.mode == "copilot"
            else [TraceStep(tool="review_colon_mdt_context", arguments="Synthetic fixture; deterministic demo")]
        ),
        note=result.note or "Illustrative source summaries only; full text and currency have not been verified.",
    )


@router.post("/extract", response_model=ExtractResult)
async def extract(request: ExtractRequest) -> ExtractResult:
    facts = _facts(_patient(request.patient_id), request.horizon)
    blocks = [
        UIBlock(
            type="patient_card",
            title="Extracted facts · physician review required",
            body="Synthetic extraction. Correct values and result status before requesting recommendations.",
            items=[UIItem(label=f.label, detail=f"{f.value} · {f.status}", source=f.source) for f in facts],
        ),
        UIBlock(
            type="alert",
            title="No automatic clinical decision",
            severity="warning",
            body=_fixture()["disclaimer"],
        ),
    ]
    agent = await _agent(
        "Extract facts for physician review",
        request.patient_id,
        {"horizon": request.horizon, "facts": [f.model_dump() for f in facts]},
        blocks,
    )
    return ExtractResult(patient_id=request.patient_id, horizon=request.horizon, facts=facts, agent=agent)


def _reviewed_facts(request: RecommendRequest, patient: dict) -> list[Fact]:
    supplied = {f.key: f for f in request.facts}
    known = {f.key for f in _facts(patient, request.horizon)}
    if len(supplied) != len(request.facts) or not set(supplied) <= known:
        raise HTTPException(422, "Fact keys must be unique and belong to this extraction")
    facts = []
    for original in _facts(patient, request.horizon):
        if original.status == "unavailable":
            facts.append(original)
            continue
        fact = supplied.get(original.key)
        if fact is None:
            facts.append(original.model_copy(update={"value": "Not provided in review", "status": "missing"}))
            continue
        if fact.status == "recorded" and (
            not fact.value.strip()
            or re.search(r"\b(pending|unknown|not documented|not available|not assigned|not final)\b", fact.value, re.I)
        ):
            fact = fact.model_copy(update={"status": "missing"})
        if fact.value != original.value or fact.status != original.status:
            fact = fact.model_copy(update={"source": f"Physician correction; original source: {original.source}"})
        else:
            fact = fact.model_copy(update={"source": original.source})
        facts.append(fact.model_copy(update={"label": original.label}))
    return facts


def _assessment(facts: list[Fact]) -> tuple[list[Recommendation], list[MissingItem], list[str]]:
    by_key = {f.key: f for f in facts}

    def recorded(key: str) -> bool:
        return by_key[key].status == "recorded"

    postoperative = recorded("phase") and "postoperative" in by_key["phase"].value.lower()
    required = {"site", "diagnosis", "phase", "staging", "mmr", "performance", "renal", "allergy", "wishes"}
    required |= {"ptnm", "margins"} if postoperative else {"ctnm"}
    missing = [
        MissingItem(
            field=f.label,
            status=f.status,
            source=f.source,
            action=(
                "Check the requested result and update the reviewed fact when reported."
                if f.status == "pending"
                else "Obtain this information separately; absence is not a negative finding."
                if f.status == "unavailable"
                else "Ask the patient or responsible team and document the answer."
            ),
        )
        for f in facts
        if f.key in required and not recorded(f.key)
    ]
    conflicts = []
    for key, explanation in [
        ("allergy", "Drug/anaesthetic safety conflict: review the recorded reaction before routine prescribing"),
        ("wishes", "Preference constraint: do not assume the default treatment matches the patient's values"),
    ]:
        fact = by_key[key]
        if not recorded(key):
            conflicts.append(f"{fact.label} cannot be assessed: {fact.status}; do not infer no conflict.")
        elif not re.fullmatch(
            r"\s*(none|no known allergies|no allergies)[.!]?\s*"
            if key == "allergy"
            else r"\s*(none|no treatment constraints)[.!]?\s*",
            fact.value,
            re.I,
        ):
            conflicts.append(f"{explanation}: {fact.value} [{fact.source}].")
    if not recorded("performance"):
        conflicts.append("Fitness is unavailable; treatment suitability remains unassessed.")
    localised = (
        recorded("staging")
        and bool(re.search(r"\b(no distant metastases|M0|non.metastatic)\b", by_key["staging"].value, re.I))
        and not re.search(r"\b(pending|incomplete|cannot|not)\b", by_key["staging"].value, re.I)
        and not any(
            recorded(key) and re.search(r"M1|distant metastases present", by_key[key].value, re.I)
            for key in ("staging", "ctnm", "ptnm")
        )
    )
    reasons = (
        "Illustrative primary-treatment discussion only. No guideline full text or latest version has been verified. "
        "Use the reviewed facts below; pending results and safety/preferences prevent a final plan."
    )
    used = [f.key for f in facts if recorded(f.key)]
    missing_labels = [item.field for item in missing]
    if not recorded("site") or "colon" not in by_key["site"].value.lower():
        title = "Confirm the primary colon pathway"
        options = ["Confirm tumour localisation; do not apply this colon prototype to another primary site."]
    elif recorded("diagnosis") and (
        not re.fullmatch(r"\s*(?:colon(?:ic)?\s+)?adenocarcinoma[.!]?\s*", by_key["diagnosis"].value, re.I)
    ):
        title = "Confirm diagnosis · outside the adenocarcinoma pathway"
        options = [
            "Confirm the reviewed histological diagnosis with pathology.",
            "Use the appropriate specialist MDT pathway for this diagnosis; outside this adenocarcinoma demo.",
            "Do not apply routine colon adenocarcinoma surgery or adjuvant options to a different histology.",
        ]
    elif not localised or not recorded("diagnosis") or not recorded("phase"):
        title = "Complete staging and diagnosis before narrowing treatment"
        options = [
            "If confirmed localised and operable: discuss a primary surgical pathway with the MDT.",
            "If distant disease or a different diagnosis is found: re-discuss the pathway; outside this demo.",
            "Keep the plan provisional while the requested staging or biopsy results are pending.",
        ]
    elif postoperative:
        title = "Discuss postoperative risk and adjuvant options"
        node_positive = recorded("ptnm") and bool(re.search(r"N[1-2]", by_key["ptnm"].value, re.I))
        options = [
            "Discuss adjuvant systemic treatment with oncology after pathology, MMR and safety review."
            if node_positive
            else "Review pathological stage and risk before discussing surveillance versus adjuvant treatment.",
            "Discuss a non-oxaliplatin approach or surveillance where appropriate; no regimen selected here.",
            "Resolve drug reactions and patient wishes with the physician before choosing an option.",
        ]
        if not recorded("ptnm") or not recorded("margins"):
            options.insert(0, "Await final resection pathology and margins before choosing an adjuvant pathway.")
        if not recorded("mmr"):
            options.append(
                "MMR/MSI is pending: keep biomarker-dependent options conditional until the result is reviewed."
            )
        elif re.search(r"dMMR|MSI.high|deficient|loss of", by_key["mmr"].value, re.I):
            options.append(
                "Review dMMR/MSI-high in the context of pathological stage; do not assume chemotherapy benefit "
                "or select a biomarker-directed treatment automatically."
            )
    else:
        title = "Discuss primary surgery for the localised colon scenario"
        options = [
            "Discuss oncological colon resection and perioperative assessment with the surgical MDT.",
            "Discuss alternatives if fitness, anatomy or patient wishes make surgery unsuitable.",
            "Review postoperative pathology later; do not select adjuvant treatment from clinical stage alone.",
        ]
    recommendations = [
        Recommendation(
            id="primary-pathway",
            title=title,
            options=options,
            rationale=reasons,
            used_facts=used,
            missing=missing_labels,
            source_ids=["dutch", "italian", "nccn"],
        )
    ]
    return recommendations, missing, conflicts


@router.post("/recommend", response_model=Assessment)
async def recommend(request: RecommendRequest) -> Assessment:
    if not request.reviewed:
        raise HTTPException(409, "Physician review of the extracted facts is required first")
    facts = _reviewed_facts(request, _patient(request.patient_id))
    recommendations, missing, conflicts = _assessment(facts)
    blocks = [
        UIBlock(
            type="actions",
            title="Provisional options · physician decision",
            body=recommendations[0].rationale,
            items=[
                UIItem(label=option, source="Illustrative summaries; not verified full text")
                for option in recommendations[0].options
            ],
        ),
        UIBlock(
            type="evidence",
            title="Reviewed facts used",
            items=[UIItem(label=f.label, detail=f.value, source=f.source) for f in facts if f.status == "recorded"],
        ),
        UIBlock(
            type="alert",
            title="Missing results and patient-specific constraints",
            severity="warning",
            items=[UIItem(label=m.field, detail=f"{m.status}: {m.action}", source=m.source) for m in missing]
            + [UIItem(label=conflict) for conflict in conflicts],
        ),
        UIBlock(
            type="evidence",
            title="Illustrative guideline references · verification required",
            body=_fixture()["disclaimer"],
            items=[UIItem(label=s["title"], detail=s["limitations"], source=s["url"]) for s in _fixture()["sources"]],
        ),
    ]
    agent = await _agent(
        "Prepare provisional colon MDT options",
        request.patient_id,
        {
            "horizon": request.horizon,
            "facts": [f.model_dump() for f in facts],
            "recommendations": [r.model_dump() for r in recommendations],
            "missing": [m.model_dump() for m in missing],
            "conflicts": conflicts,
            "sources": _fixture()["sources"],
        },
        blocks,
    )
    return Assessment(facts=facts, recommendations=recommendations, missing=missing, conflicts=conflicts, agent=agent)
