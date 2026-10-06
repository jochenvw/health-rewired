"""A consultation about fictional past patients, never a treatment recommendation."""

import json
from math import sqrt
from typing import Literal

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel

from app import sample_data
from app.agent import run_agent
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/92", tags=["Patients like me"])
SOURCE = "patients-like-me-history.json"
MIN_GROUP = 10


class CohortRequest(BaseModel):
    horizon: Literal["future", "six-month"] = "future"
    strict: bool = False


class ExplainRequest(CohortRequest):
    language: Literal["English", "German"] = "English"
    literacy: Literal["plain", "detailed"] = "plain"


def metric(label: str, observations: list[bool], cohort_size: int, *, unavailable: bool = False) -> dict:
    n = len(observations)
    reason = None
    if unavailable:
        reason = "Clinic-note toxicity data are missing in the six-month demonstration."
    elif cohort_size < MIN_GROUP or n < MIN_GROUP:
        reason = f"Too few known outcomes: need at least {MIN_GROUP} per treatment and measure."
    result = dict(label=label, n=n, events=None, percent=None, low=None, high=None, reason=reason)
    if reason:
        return result
    events = sum(observations)
    p = events / n
    z = 1.96
    center = (p + z * z / (2 * n)) / (1 + z * z / n)
    margin = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return {
        **result,
        "events": events,
        "percent": round(p * 100),
        "low": round((center - margin) * 100),
        "high": round((center + margin) * 100),
    }


def coverage() -> list[dict]:
    names = {
        "Age",
        "Topography",
        "Morphology",
        "cTNM",
        "Non-metastatic CRC: MSI",
        "WHO performance status",
        "Medical history",
        "Systemic therapy regimen",
        "Surgery yes/no",
        "Type and schedule of radiotherapy",
        "Overall survival",
        "Recurrence yes/no",
        "Toxicity grade 3 or higher during treatment",
    }
    return [
        {
            "group": group["group"],
            "name": element["name"],
            "likely_source": element["likely_source"],
            "status": "available" if element["likely_source"] in {"structured", "derived"} else "partial",
        }
        for group in sample_data.read("minimal-mdt-dataset.json")["groups"]
        for element in group["elements"]
        if element["name"] in names
    ] + [
        {
            "group": "Beyond the minimal dataset",
            "name": "Live cross-hospital pooling",
            "likely_source": "not in minimal dataset",
            "status": "missing",
        },
        {
            "group": "Beyond the minimal dataset",
            "name": "KRAS matching in non-metastatic disease",
            "likely_source": "not defined for non-metastatic CRC",
            "status": "missing",
        },
    ]


def build_cohort(request: CohortRequest) -> dict:
    patient = sample_data.get_patient("P-046")
    records = sample_data.read(SOURCE)["records"]
    local = request.horizon == "six-month"
    screened = [r for r in records if not local or r["site"] == "Munich"]
    age = patient["age"]
    matched = [
        r
        for r in screened
        if r["site_of_tumour"] == patient["diagnosis"]["site"]
        and r["stage"] == patient["diagnosis"]["stage"]
        and r["msi"] == "MSS"
        and (r["age"] // 10 == age // 10 if request.strict else age // 10 * 10 <= r["age"] < age // 10 * 10 + 20)
        and (local or (r["ecog"] == patient["ecog"] if request.strict else abs(r["ecog"] - patient["ecog"]) <= 1))
    ]
    groups = []
    for treatment in sorted({r["treatment"] for r in screened}):
        rows = [r for r in matched if r["treatment"] == treatment]
        measures = []
        for year in (1, 3, 5):
            month = year * 12
            known = [
                r["death_month"] is None or r["death_month"] > month
                for r in rows
                if r["follow_up_months"] >= month or (r["death_month"] is not None and r["death_month"] <= month)
            ]
            measures.append(metric(f"Alive at {year} year{'s' if year > 1 else ''}", known, len(rows)))
        recurrence = [
            r["recurrence"]
            for r in rows
            if r["recurrence"] is True or (r["recurrence"] is False and r["follow_up_months"] >= 60)
        ]
        measures.append(metric("Recurrence within 5 years", recurrence, len(rows)))
        side_effects = [] if local else [r["major_side_effect"] for r in rows if r["major_side_effect"] is not None]
        measures.append(metric("Major side effects", side_effects, len(rows), unavailable=local))
        groups.append(
            {
                "treatment": treatment,
                "count": len(rows),
                "fit_count": None if local else sum(r["ecog"] <= 1 for r in rows),
                "metrics": measures,
            }
        )
    warnings = [
        "Past outcomes do not prove a treatment caused them. Treatment decisions stay with the patient and oncologist.",
        "Illustrative observed proportions, not survival-model estimates or your personal prognosis. "
        "Incomplete follow-up is excluded per measure; 95% ranges show sampling uncertainty, not bias.",
    ]
    if len(matched) < MIN_GROUP:
        warnings.insert(0, "Too few comparable patients. Outcome numbers are withheld; do not broaden silently.")
    if local:
        warnings.insert(
            0,
            "Fitness and major side effects are missing clinic-note fields here. "
            "Imbalance cannot be assessed; confounding by indication remains unresolved.",
        )
    elif all(g["count"] for g in groups) and len(groups) == 2:
        rates = [g["fit_count"] / g["count"] for g in groups]
        if abs(rates[0] - rates[1]) >= 0.2:
            warnings.insert(
                0,
                "Confounding by indication: the total neoadjuvant group was much fitter "
                "than the chemoradiotherapy group. Sicker people received different care. "
                "Do not rank these treatments by their raw outcomes.",
            )
    return {
        "patient": patient,
        "horizon": request.horizon,
        "strict": request.strict,
        "count": len(matched),
        "screened": len(screened),
        "source": f"sample-data/{SOURCE}",
        "matches": [
            "Rectal cancer, stage III",
            "MMR proficient / MSS",
            "Age 60–69" if request.strict else "Age 60–79",
            "Fitness not used: clinic-note gap"
            if local
            else ("ECOG 1, same recorded fitness" if request.strict else "ECOG 0–2, within one level of your fitness"),
        ],
        "differences": [
            "Not exact twins: age and fitness may differ within the selected range.",
            "Histology detail, KRAS and other illnesses are not matched: historical records do not contain them.",
            "Treatment selection, tumour detail and care era may differ; no causal adjustment was performed.",
        ],
        "warnings": warnings,
        "groups": groups,
        "records": [{**r, "ecog": None, "major_side_effect": None} if local else r for r in matched],
        "coverage": coverage(),
    }


@router.post("/cohort")
def cohort(request: CohortRequest) -> dict:
    return build_cohort(request)


@define_tool(
    description="Match fictional past colorectal patients and compute counts, uncertainty and bias warnings.",
    skip_permission=True,
)
def find_similar_patients(params: CohortRequest) -> str:
    data = build_cohort(params)
    # The assistant needs aggregates, not individual outcome anecdotes.
    return json.dumps({k: v for k, v in data.items() if k not in {"records", "coverage"}})


def demo_explanation(request: ExplainRequest, data: dict, note: str | None) -> AgentResult:
    german = request.language == "German"
    summary = (
        f"Wir haben {data['count']} ähnliche, erfundene Patienten gefunden. Sie hatten denselben Tumorort, "
        "dasselbe Stadium und einen ähnlichen MSI-Befund. Alter und Fitness sind nicht immer gleich. "
        "Die Zahlen sagen nicht voraus, was bei Ihnen passiert. Unterschiedliche Gesundheit kann erklären, "
        "warum Behandlungen unterschiedliche Ergebnisse zeigen."
        if german
        else f"We found {data['count']} similar fictional patients. "
        "They had the same tumour site, stage and MSI result. "
        "Age and fitness are not always the same. These numbers cannot tell you what will happen to you. "
        "Differences in health may explain why treatment groups had different outcomes."
    )
    if request.literacy == "detailed":
        summary += (
            " Beobachtete Anteile schließen unvollständige Nachbeobachtung aus. Die 95%-Wilson-Intervalle "
            "zeigen nur Stichprobenunsicherheit, keine Korrektur für Behandlungsselektion."
            if german
            else " Observed proportions exclude incomplete follow-up. The 95% Wilson intervals reflect sampling "
            "uncertainty only, not correction for treatment-selection bias."
        )
    if data["count"] < MIN_GROUP:
        summary += (
            " Die Gruppe ist zu klein; Zahlen bleiben verborgen."
            if german
            else " The group is too small; numbers are withheld."
        )
    if request.horizon == "six-month":
        summary += (
            " Fitness und schwere Nebenwirkungen fehlen hier; ein Vergleich bleibt unsicher."
            if german
            else " Fitness and major side effects are missing here; comparison remains uncertain."
        )
    questions = (
        [
            "Wie ähnlich sind mir diese Patienten wirklich?",
            "Wie beeinflusst meine Fitness die Wahl?",
            "Welche Nebenwirkungen sind mir besonders wichtig?",
            "Was wissen wir noch nicht über meinen Fall?",
        ]
        if german
        else [
            "How similar are these patients to me, really?",
            "How does my fitness affect the options?",
            "Which side effects matter most to me?",
            "What do we still not know about my case?",
        ]
    )
    return AgentResult(
        mode="fallback",
        headline="Fragen für das nächste Gespräch" if german else "Questions for your next consultation",
        note=note,
        trace=[TraceStep(tool="find_similar_patients")],
        blocks=[
            UIBlock(type="summary", title="Einfach erklärt" if german else "In your words", body=summary),
            UIBlock(
                type="alert",
                title="Kein Behandlungsnachweis" if german else "Not proof of treatment benefit",
                severity="warning",
                body=(
                    "Kleine Gruppen, fehlende Daten und unterschiedliche Fitness begrenzen den Vergleich."
                    if german
                    else "Small groups, missing data and different fitness limit this comparison."
                ),
            ),
            UIBlock(
                type="actions",
                title="Mit Ihrem Behandlungsteam besprechen" if german else "Ask your care team",
                items=[UIItem(label=q, source=f"sample-data/{SOURCE}") for q in questions],
            ),
        ],
    )


@router.post("/explain")
async def explain(request: ExplainRequest) -> AgentResult:
    data = build_cohort(request)
    result = await run_agent(
        AgentRequest(
            task="Explain comparable patients and prepare consultation questions.",
            patient_id="P-046",
            role="Patient and oncologist together",
        ),
        system_prompt=(
            "You support a synthetic colorectal consultation. Call find_similar_patients with the provided filters, "
            "then render_ui with summary, evidence/alert and actions blocks in the requested language and literacy. "
            "Explain matches AND mismatches, missing fields, small groups, uncertainty and confounding by indication. "
            "Address the patient, not an MDT. In plain mode use short common words and at most 150 words "
            "of explanation plus four brief questions; detailed mode at most 350 words plus questions. "
            "Do not repeat the full outcome table; the consultation screen already displays it. "
            "Use only supplied aggregates. Never invent numbers or rank treatments. "
            "Never recommend treatment or infer causality. "
            "Never expose individual outcome anecdotes. Draft four patient questions for human edit/approval. "
            "All data fictional; no personal prognosis."
        ),
        prompt=json.dumps(request.model_dump()),
        extra_tools=[find_similar_patients],
    )
    return demo_explanation(request, data, result.note) if result.mode == "fallback" else result
