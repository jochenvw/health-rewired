"""Idea #55 – from a DNA result to a matching trial anywhere in Europe.

One synthetic patient (P-004, metastatic colorectal cancer with an ERBB2/HER2 amplification) is
screened against a synthetic European trial registry in four languages. Matching is deterministic
here so the screen always tells the same story; the Copilot SDK agent explains the alteration and
drafts the cross-border referral package in the receiving centre's language.
"""

import json
from typing import Any

from copilot import define_tool
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/55", tags=["idea-55"])

PATIENT_ID = "P-004"
PATIENT_PATH = f"patients/{PATIENT_ID}.json"
REPORT_PATH = "genomics/P-004-wgs-report.md"
TRIALS_PATH = "trials/eu-molecular-trials.json"
TEMPLATE_PATH = "referrals/referral-package-template.md"

SYSTEM_PROMPT = """\
You are the molecular tumour board assistant of the Oncology Hackathon 2026 Munich prototype.
You help an oncologist go from a DNA report to clinical trials across Europe.

Rules:
- All data is SYNTHETIC (from /sample-data). Never invent patient facts; look them up with tools
  and cite the file in `source`.
- Eligibility criteria are met, not met or UNKNOWN. Never turn an unknown into a yes or a no.
- The molecular tumour board judges clinical relevance; the receiving trial team decides final
  eligibility; a referral is always a draft for a human to review, never sent automatically.
- Keep text short and clinical. Finish by calling `render_ui` exactly once.
"""


class NoParams(BaseModel):
    pass


class MatchRequest(BaseModel):
    """Values the oncologist added by hand, keyed by fact name (e.g. ``{"lvef": "62"}``)."""

    answers: dict[str, str] = Field(default_factory=dict)


class ReferralRequest(MatchRequest):
    trial_id: str = Field(min_length=3, max_length=40)


def _number(value: str) -> Any:
    try:
        return float(value)
    except (TypeError, ValueError):
        return value


def _facts(answers: dict[str, str]) -> dict[str, dict[str, Any]]:
    """Everything the matcher knows about the patient, each value with the file it came from."""
    record = sample_data.get_patient(PATIENT_ID)
    labs = {lab["test"]: lab for lab in record.get("labs", [])}
    facts: dict[str, dict[str, Any]] = {
        "tumour_type": {
            "value": "colorectal",
            "display": "Metastatic rectosigmoid adenocarcinoma",
            "source": PATIENT_PATH,
        },
        "age": {"value": record.get("age"), "display": f"{record.get('age')} years (AYA)", "source": PATIENT_PATH},
        "ecog": {"value": record.get("ecog"), "display": f"ECOG {record.get('ecog')}", "source": PATIENT_PATH},
        "her2_amplified": {"value": True, "display": "ERBB2 amplification, copy number 11.4", "source": REPORT_PATH},
        "ras_status": {"value": "wild-type", "display": "KRAS/NRAS wild-type", "source": REPORT_PATH},
        "braf_status": {"value": "wild-type", "display": "BRAF wild-type", "source": REPORT_PATH},
        "msi_status": {"value": "MSS", "display": "MSS / pMMR", "source": REPORT_PATH},
        "tmb": {"value": 7.2, "display": "TMB 7.2 mut/Mb", "source": REPORT_PATH},
        "prior_lines": {"value": 2, "display": "FOLFOX + bevacizumab, then FOLFIRI", "source": PATIENT_PATH},
        "prior_anti_vegf": {"value": True, "display": "Bevacizumab in first line", "source": PATIENT_PATH},
        "prior_anti_her2": {"value": False, "display": "No HER2-directed treatment so far", "source": PATIENT_PATH},
        "measurable_disease": {
            "value": True,
            "display": "3 liver lesions, 2 lung nodules (RECIST 1.1)",
            "source": PATIENT_PATH,
        },
        "brain_metastases": {"value": False, "display": "MRI brain 2026-03-04: no metastases", "source": PATIENT_PATH},
        "interstitial_lung_disease": {"value": False, "display": "No ILD recorded", "source": PATIENT_PATH},
        "creatinine_clearance": {
            "value": labs.get("Creatinine clearance", {}).get("value"),
            "display": "96 mL/min (2026-03-10)",
            "source": PATIENT_PATH,
        },
        # Deliberately missing: no echocardiogram in the oncology record.
        "lvef": {"value": None, "display": None, "source": None},
    }
    for key, raw in answers.items():
        if key in facts and str(raw).strip():
            facts[key] = {
                "value": _number(str(raw).strip()),
                "display": f"{str(raw).strip()} (added by the oncologist)",
                "source": "Added in the molecular tumour board preparation screen",
            }
    return facts


def _check(criterion: dict[str, Any], fact: dict[str, Any] | None) -> str:
    if fact is None or fact.get("value") is None:
        return "unknown"
    value, op, expected = fact["value"], criterion["op"], criterion.get("value")
    match op:
        case "is_true":
            return "met" if bool(value) else "not_met"
        case "is_false":
            return "met" if not bool(value) else "not_met"
        case "eq":
            return "met" if str(value).lower() == str(expected).lower() else "not_met"
        case "min":
            return "met" if float(value) >= float(expected) else "not_met"
        case "max":
            return "met" if float(value) <= float(expected) else "not_met"
    return "unknown"


def evaluate(answers: dict[str, str] | None = None) -> dict[str, Any]:
    """Screen every synthetic European trial against the patient. Deterministic, no model call."""
    facts = _facts(answers or {})
    registry = sample_data.read(TRIALS_PATH)
    shortlist: list[dict[str, Any]] = []
    screened_out: list[dict[str, Any]] = []

    for trial in registry["trials"]:
        if trial.get("screen_out"):
            screened_out.append(
                {k: trial[k] for k in ("id", "country", "city", "title_en", "phase", "status", "screen_out")}
            )
            continue
        criteria = []
        for criterion in trial["criteria"]:
            fact = facts.get(criterion["fact"])
            status = _check(criterion, fact)
            criteria.append(
                {
                    "id": criterion["id"],
                    "kind": criterion["kind"],
                    "text_local": criterion["text_local"],
                    "text_en": criterion["text_en"],
                    "status": status,
                    "fact": criterion["fact"],
                    "observed": (fact or {}).get("display"),
                    "source": (fact or {}).get("source"),
                    "ask": criterion.get("ask"),
                }
            )
        if any(c["status"] == "not_met" for c in criteria):
            verdict = "excluded"
        elif any(c["status"] == "unknown" for c in criteria):
            verdict = "blocked"
        else:
            verdict = "match"
        shortlist.append(
            {**{k: v for k, v in trial.items() if k != "criteria"}, "criteria": criteria, "verdict": verdict}
        )

    return {
        "patient_id": PATIENT_ID,
        "screened": len(registry["trials"]),
        "countries": sorted({t["country"] for t in registry["trials"]}),
        "languages": sorted({t["language"] for t in registry["trials"]}),
        "registry_snapshot": registry["registry_snapshot"],
        "drug_availability": registry["drug_availability"],
        "shortlist": shortlist,
        "screened_out": screened_out,
        "missing": [
            {"fact": crit["fact"], **crit["ask"], "trial_id": trial["id"], "criterion": crit["text_en"]}
            for trial in shortlist
            for crit in trial["criteria"]
            if crit["status"] == "unknown" and crit.get("ask")
        ],
    }


@define_tool(
    description="Get the synthetic DNA report and clinical summary for this molecular tumour board case.",
    skip_permission=True,
)
def get_molecular_case(params: NoParams) -> str:
    return json.dumps(
        {
            "patient": sample_data.get_patient(PATIENT_ID),
            "dna_report_markdown": sample_data.read_text(REPORT_PATH),
            "dna_report_source": REPORT_PATH,
        }
    )


@define_tool(
    description="Get the European trial screening: each criterion marked met, not met or unknown, with its source.",
    skip_permission=True,
)
def get_trial_screening(params: NoParams) -> str:
    return json.dumps(evaluate())


@define_tool(
    description="Read the cross-border referral package template with section headings per language.",
    skip_permission=True,
)
def get_referral_template(params: NoParams) -> str:
    return sample_data.read_text(TEMPLATE_PATH)


@router.get("/case")
async def case() -> dict[str, Any]:
    """Everything the screen needs before any AI call: record, DNA report, registry overview."""
    screening = evaluate()
    return {
        "patient": sample_data.get_patient(PATIENT_ID),
        "dna_report": sample_data.read_text(REPORT_PATH),
        "dna_report_source": REPORT_PATH,
        "screening": screening,
    }


@router.post("/match")
async def match(request: MatchRequest) -> dict[str, Any]:
    return evaluate(request.answers)


@router.post("/interpret")
async def interpret() -> AgentResult:
    """Agent reads the DNA report, links the variant to knowledge sources and explains it."""
    result = await run_agent(
        AgentRequest(task="Explain the reportable alteration for the molecular tumour board", patient_id=PATIENT_ID),
        system_prompt=SYSTEM_PROMPT,
        prompt=(
            "Call get_molecular_case, then get_trial_screening. Explain to the oncologist, in plain "
            "language: which alteration was found, what it means for this metastatic colorectal cancer, "
            "its evidence tier, and which other findings are not actionable. Say what is still missing "
            "before European trials can be checked. Render: one `summary` block with the explanation, "
            "one `evidence` block with the alterations and their tiers (cite the report file as source), "
            "and one `alert` block for the missing cardiac assessment."
        ),
        extra_tools=[get_molecular_case, get_trial_screening],
    )
    return result if result.mode == "copilot" else _interpretation_demo(result.note)


@router.post("/referral")
async def referral(request: ReferralRequest) -> AgentResult:
    """Agent drafts the cross-border referral package in the receiving centre's language."""
    screening = evaluate(request.answers)
    trial = next((t for t in screening["shortlist"] if t["id"] == request.trial_id), None)
    if trial is None:
        return _referral_demo(None, "Unknown trial id; showing the prepared demo package.")
    result = await run_agent(
        AgentRequest(task=f"Draft the referral package for {trial['id']}", patient_id=PATIENT_ID),
        system_prompt=SYSTEM_PROMPT,
        prompt=(
            f"Call get_molecular_case, get_trial_screening and get_referral_template. Draft a referral "
            f"package for trial {trial['id']} at {trial['site']}, {trial['city']} ({trial['country']}). "
            f"Write the cover letter and section headings in {trial['language']}, and keep an English "
            "line under each section so the referring oncologist can check it. Render: one `summary` "
            "block with the cover letter, one `evidence` block listing each eligibility criterion with "
            "met / not met / unknown and its source, and one `actions` block with what the oncologist "
            "must approve before anything is sent (nothing is sent automatically)."
        ),
        extra_tools=[get_molecular_case, get_trial_screening, get_referral_template],
    )
    return result if result.mode == "copilot" else _referral_demo(trial, result.note)


def _interpretation_demo(note: str | None) -> AgentResult:
    return AgentResult(
        mode="fallback",
        headline="ERBB2 (HER2) amplification – Tier I, actionable in trials",
        blocks=[
            UIBlock(
                type="summary",
                title="What the DNA report shows",
                body=(
                    "The tumour carries a focal ERBB2 (HER2) amplification with a high copy number (11.4). "
                    "In RAS and BRAF wild-type metastatic colorectal cancer this predicts benefit from "
                    "HER2-directed treatment, which is currently available in clinical trials. The tumour is "
                    "MSS with a low mutational burden (7.2 mut/Mb), so immunotherapy trials are not relevant. "
                    "TP53 and APC alterations are prognostic only."
                ),
            ),
            UIBlock(
                type="evidence",
                title="Alterations and evidence level",
                items=[
                    UIItem(
                        label="ERBB2 (HER2) amplification",
                        detail="Copy number 11.4 · Tier I · ESCAT I-B (synthetic annotation)",
                        source=REPORT_PATH,
                    ),
                    UIItem(
                        label="KRAS / NRAS / BRAF",
                        detail="Wild-type – keeps HER2-directed trials open",
                        source=REPORT_PATH,
                    ),
                    UIItem(
                        label="MSI / TMB",
                        detail="MSS, 7.2 mut/Mb – immunotherapy trials not indicated",
                        source=REPORT_PATH,
                    ),
                    UIItem(label="TP53 p.R248W, APC p.Q1367*", detail="Tier III, prognostic only", source=REPORT_PATH),
                ],
            ),
            UIBlock(
                type="alert",
                title="Missing before HER2 trials can be checked",
                severity="warning",
                body=(
                    "No echocardiogram (LVEF) is in the oncology record. Several anti-HER2 trials "
                    "require a documented LVEF within 90 days."
                ),
                items=[
                    UIItem(
                        label="Left ventricular ejection fraction",
                        detail="Not in the record – shown as unknown, never assumed",
                        source=PATIENT_PATH,
                    )
                ],
            ),
        ],
        trace=[TraceStep(tool="get_molecular_case"), TraceStep(tool="get_trial_screening")],
        note=note or "Demo mode: deterministic interpretation, no Copilot token configured.",
    )


def _referral_demo(trial: dict[str, Any] | None, note: str | None) -> AgentResult:
    if trial is None:
        return AgentResult(
            mode="fallback",
            headline="Referral package",
            blocks=[UIBlock(type="alert", title="No trial selected", body="Select a matching trial first.")],
            note=note,
        )
    criteria = [
        UIItem(
            label=f"{c['text_en']} ({c['text_local']})",
            detail={"met": "Met", "not_met": "Not met", "unknown": "Unknown – to be confirmed"}[c["status"]]
            + (f" · {c['observed']}" if c["observed"] else ""),
            source=c["source"],
            severity="info" if c["status"] == "met" else "warning",
        )
        for c in trial["criteria"]
    ]
    cover = {
        "Italian": (
            f"Gentile Équipe dello studio {trial['id']},\n\n"
            "vi scrivo per proporre la valutazione di una paziente di 29 anni con adenocarcinoma "
            "rettosigmoideo metastatico, RAS e BRAF wild-type, MSS, con amplificazione di HER2 (ERBB2, "
            "numero di copie 11.4) documentata mediante sequenziamento dell'intero genoma il 14/03/2026. "
            "La paziente ha ricevuto due linee di terapia sistemica (FOLFOX + bevacizumab, poi FOLFIRI) "
            "con progressione radiologica il 02/03/2026. FEVS 62% (ecocardiogramma del 12/03/2026). "
            "In allegato il referto molecolare, le immagini recenti e gli esami di laboratorio.\n\n"
            "Questa proposta di invio è una bozza preparata per il molecular tumour board; l'idoneità "
            "definitiva è decisa dal centro ricevente."
        ),
        "Dutch": (
            f"Geacht studieteam van {trial['id']},\n\n"
            "hierbij verwijs ik een 29-jarige patiënte met gemetastaseerd rectosigmoïdcarcinoom, RAS- en "
            "BRAF-wildtype, MSS, met een HER2 (ERBB2)-amplificatie (kopieaantal 11.4), aangetoond met "
            "whole-genome sequencing op 14-03-2026.\n\n"
            "Deze verwijzing is een concept voor de moleculaire tumorboard; het ontvangende studieteam "
            "beslist over de definitieve geschiktheid."
        ),
        "German": (
            f"Sehr geehrtes Studienteam der Studie {trial['id']},\n\n"
            "ich stelle Ihnen eine 29-jährige Patientin mit metastasiertem Rektosigmakarzinom, RAS- und "
            "BRAF-Wildtyp, MSS, mit HER2-(ERBB2-)Amplifikation vor.\n\n"
            "Diese Überweisung ist ein Entwurf für das molekulare Tumorboard; die endgültige Eignung "
            "entscheidet das aufnehmende Studienteam."
        ),
    }.get(trial["language"], "Cover letter draft.")
    return AgentResult(
        mode="fallback",
        headline=f"Draft referral package · {trial['site']} · {trial['language']}",
        blocks=[
            UIBlock(
                type="summary", title=f"Lettera di accompagnamento / Cover letter ({trial['language']})", body=cover
            ),
            UIBlock(
                type="evidence", title="Verifica dei criteri di eleggibilità / Eligibility evidence", items=criteria
            ),
            UIBlock(
                type="actions",
                title="Before anything is sent – your decision",
                items=[
                    UIItem(
                        label="Check the translated cover letter",
                        detail="You approve the wording; nothing leaves the hospital automatically.",
                    ),
                    UIItem(
                        label="Attach WGS report, CT 2026-03-02 and labs",
                        detail="Attachment list prepared from the template",
                        source=TEMPLATE_PATH,
                    ),
                    UIItem(
                        label="Discuss at the molecular tumour board on 17-03-2026",
                        detail="The board judges clinical relevance of the alteration.",
                    ),
                    UIItem(
                        label="Ask the patient whether she wants to travel to " + trial["city"],
                        detail=trial.get("travel_from_munich", ""),
                    ),
                    UIItem(
                        label="Start EU S2 prior authorisation",
                        detail="Cross-border care form; receiving team decides final eligibility.",
                    ),
                ],
            ),
        ],
        trace=[
            TraceStep(tool="get_molecular_case"),
            TraceStep(tool="get_trial_screening"),
            TraceStep(tool="get_referral_template"),
        ],
        note=note or "Demo mode: deterministic referral draft, no Copilot token configured.",
    )
