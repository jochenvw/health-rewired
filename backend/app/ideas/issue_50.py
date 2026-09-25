"""Idea #50 – Record once, reuse everywhere.

One metastatic colorectal cancer patient whose records arrived from four hospitals in Dutch,
French, Italian and German. The extraction result is deterministic (so the walkthrough always
works, with or without a Copilot token); the Copilot SDK agent reads the same multilingual
documents and explains what it could not settle on its own.
"""

from typing import Any

from fastapi import APIRouter

from app import sample_data
from app.agent import AgentRequest, AgentResult, run_agent
from app.agent.models import TraceStep
from app.agent.ui import UIBlock, UIItem

router = APIRouter(prefix="/api/ideas/50", tags=["idea-50"])

PATIENT: dict[str, Any] = {
    "id": "HR-2041",
    "name": "Sofia Lombardi",
    "age": 62,
    "sex": "female",
    "diagnosis": "Metastatic colorectal cancer · sigmoid colon",
    "mdt": "Gastrointestinal tumour board · Thursday 08:00",
}

DOCUMENTS: list[dict[str, str]] = [
    {
        "id": "nl-note",
        "path": "multilingual/HR-2041-nl-oncology-note.md",
        "language": "Dutch",
        "flag": "NL",
        "hospital": "Ziekenhuis Noordwal, Amsterdam",
        "kind": "Outpatient oncology letter",
        "date": "2026-03-14",
    },
    {
        "id": "fr-path",
        "path": "multilingual/HR-2041-fr-pathology.md",
        "language": "French",
        "flag": "FR",
        "hospital": "Hôpital Saint-Aubin, Lille",
        "kind": "Pathology report",
        "date": "2024-07-22",
    },
    {
        "id": "it-rad",
        "path": "multilingual/HR-2041-it-radiology.md",
        "language": "Italian",
        "flag": "IT",
        "hospital": "Ospedale San Felice, Bologna",
        "kind": "CT report",
        "date": "2026-01-09",
    },
    {
        "id": "de-mol",
        "path": "multilingual/HR-2041-de-molecular.md",
        "language": "German",
        "flag": "DE",
        "hospital": "Klinikum Ostpark, Leipzig",
        "kind": "Molecular pathology report",
        "date": "2026-01-20",
    },
]

# The minimal MDT dataset. Every value keeps the original sentence it came from, so a clinician
# can check it before confirming. `status` drives what the screen shows first.
FIELDS: list[dict[str, Any]] = [
    {
        "id": "kras",
        "label": "RAS / KRAS status",
        "group": "Molecular",
        "suggested": "KRAS mutated (p.G12D, exon 2)",
        "coding": "SNOMED CT 445013005 · OMOP: measurement 'KRAS gene mutation analysis'",
        "confidence": "conflict",
        "status": "conflict",
        "issue": "Two sources disagree: the 2024 primary tumour was KRAS wild-type, the 2026 liver "
        "metastasis is KRAS mutated. Anti-EGFR eligibility depends on which one counts.",
        "options": ["KRAS mutated (p.G12D, exon 2)", "KRAS wild-type", "Unknown"],
        "evidence": [
            {
                "document": "de-mol",
                "quote": "Nachweis einer KRAS-Mutation in Exon 2, Codon 12 (p.G12D), Allelfrequenz 31 %.",
                "translation": "KRAS mutation detected in exon 2, codon 12 (p.G12D), allele frequency 31%.",
            },
            {
                "document": "fr-path",
                "quote": "recherche de mutation KRAS – aucune mutation détectée dans les exons 2, 3 et 4.",
                "translation": "KRAS mutation testing – no mutation detected in exons 2, 3 and 4.",
            },
        ],
    },
    {
        "id": "ecog",
        "label": "Performance status (ECOG)",
        "group": "Clinical",
        "suggested": "ECOG 1 (implied, not documented)",
        "coding": "SNOMED CT 373803002 · OMOP: observation 'ECOG performance status'",
        "confidence": "low",
        "status": "implied",
        "issue": "No performance score is written anywhere. The wording suggests ECOG 1, but this "
        "is an inference – confirm it with the patient or leave it unknown.",
        "options": ["ECOG 0", "ECOG 1", "ECOG 2", "Unknown"],
        "evidence": [
            {
                "document": "nl-note",
                "quote": "Patiënte redt zich thuis goed en doet haar eigen huishouden, zij het langzamer dan "
                "voorheen; zij rust 's middags ongeveer een uur.",
                "translation": "The patient manages well at home and does her own housekeeping, although more "
                "slowly than before; she rests for about an hour in the afternoon.",
            },
        ],
    },
    {
        "id": "msi",
        "label": "MMR / MSI status",
        "group": "Molecular",
        "suggested": "Unknown – test requested, result outstanding",
        "coding": "SNOMED CT 405831006 · OMOP: measurement 'Microsatellite instability'",
        "confidence": "none",
        "status": "missing",
        "issue": "Never resulted. Not done on the primary in Lille; requested in Leipzig but still "
        "pending. Nothing to extract – it stays unknown until the result arrives.",
        "options": ["Unknown", "MSI-high", "Microsatellite stable"],
        "evidence": [
            {
                "document": "de-mol",
                "quote": "Die Mikrosatellitenanalyse wurde angefordert, das Ergebnis steht noch aus.",
                "translation": "Microsatellite analysis has been requested, the result is still outstanding.",
            },
            {
                "document": "fr-path",
                "quote": "Statut MMR non réalisé sur ce prélèvement.",
                "translation": "MMR status not performed on this specimen.",
            },
        ],
    },
    {
        "id": "primary",
        "label": "Primary diagnosis",
        "group": "Diagnosis",
        "suggested": "Adenocarcinoma of the sigmoid colon",
        "coding": "SNOMED CT 93761005 · OMOP condition 'Malignant tumor of sigmoid colon'",
        "confidence": "high",
        "status": "ok",
        "issue": "",
        "options": ["Adenocarcinoma of the sigmoid colon", "Unknown"],
        "evidence": [
            {
                "document": "fr-path",
                "quote": "adénocarcinome lieberkühnien moyennement différencié, infiltrant la sous-séreuse.",
                "translation": "Moderately differentiated adenocarcinoma of colonic type, infiltrating the subserosa.",
            },
            {
                "document": "nl-note",
                "quote": "Bekend met een adenocarcinoom van het colon sigmoideum, primair vastgesteld in 07-2024.",
                "translation": "Known adenocarcinoma of the sigmoid colon, first diagnosed in 07-2024.",
            },
        ],
    },
    {
        "id": "tnm",
        "label": "Pathological stage (TNM)",
        "group": "Diagnosis",
        "suggested": "pT3 pN1b (3/12), grade 2",
        "coding": "UICC TNM 8th edition · SNOMED CT 258219007",
        "confidence": "high",
        "status": "ok",
        "issue": "",
        "options": ["pT3 pN1b (3/12), grade 2", "Unknown"],
        "evidence": [
            {
                "document": "fr-path",
                "quote": "adénocarcinome colique pT3 pN1b (3/12), grade 2.",
                "translation": "Colonic adenocarcinoma pT3 pN1b (3/12), grade 2.",
            },
        ],
    },
    {
        "id": "mets",
        "label": "Metastatic sites",
        "group": "Diagnosis",
        "suggested": "Liver, 3 lesions (largest 32 mm, segment VII); no lung metastases",
        "coding": "SNOMED CT 94381002 · OMOP condition 'Secondary malignant neoplasm of liver'",
        "confidence": "high",
        "status": "ok",
        "issue": "",
        "options": [
            "Liver, 3 lesions (largest 32 mm, segment VII); no lung metastases",
            "Liver only, extent unknown",
            "Unknown",
        ],
        "evidence": [
            {
                "document": "it-rad",
                "quote": "Si documentano tre lesioni focali epatiche, la maggiore di 32 mm al segmento VII, "
                "di nuova comparsa rispetto al controllo del 06-2025.",
                "translation": "Three focal liver lesions are documented, the largest 32 mm in segment VII, "
                "new compared with the 06-2025 scan.",
            },
        ],
    },
    {
        "id": "braf",
        "label": "BRAF status",
        "group": "Molecular",
        "suggested": "BRAF V600E not detected",
        "coding": "SNOMED CT 444094006 · OMOP measurement 'BRAF gene mutation analysis'",
        "confidence": "high",
        "status": "ok",
        "issue": "",
        "options": ["BRAF V600E not detected", "BRAF V600E mutated", "Unknown"],
        "evidence": [
            {
                "document": "de-mol",
                "quote": "Keine BRAF-V600E-Mutation nachweisbar.",
                "translation": "No BRAF V600E mutation detectable.",
            },
        ],
    },
    {
        "id": "treatments",
        "label": "Previous treatments",
        "group": "Treatment",
        "suggested": (
            "Left hemicolectomy (07-2024) → adjuvant CAPOX ×8 (to 02-2025) → 1st line FOLFOX + bevacizumab (01-2026)"
        ),
        "coding": "SNOMED CT 367336001 · OMOP drug_era / procedure_occurrence",
        "confidence": "medium",
        "status": "ok",
        "issue": "",
        "options": [
            "Left hemicolectomy (07-2024) → adjuvant CAPOX ×8 (to 02-2025) → 1st line FOLFOX + bevacizumab (01-2026)",
            "Unknown",
        ],
        "evidence": [
            {
                "document": "nl-note",
                "quote": "Na hemicolectomie links volgde adjuvante chemotherapie met CAPOX, 8 kuren, afgerond in "
                "02-2025.",
                "translation": "After left hemicolectomy, adjuvant chemotherapy with CAPOX followed, 8 cycles, "
                "completed in 02-2025.",
            },
            {
                "document": "nl-note",
                "quote": "waarna eerstelijns behandeling met FOLFOX plus bevacizumab is gestart.",
                "translation": "after which first-line treatment with FOLFOX plus bevacizumab was started.",
            },
        ],
    },
]

SYSTEM_PROMPT = """You support an MDT coordinator preparing a tumour board.
The patient's records come from four hospitals in Dutch, French, Italian and German.
Read the documents you are given with read_sample_data, then explain in English what a clinician
must decide before the dataset can be confirmed. Never invent a value that is not written down:
if something is missing or only implied, say so and keep it unknown.
Finish by calling render_ui exactly once with an alert block for each conflicting or missing value
and an evidence block quoting the original sentence (with its language) behind each point."""

PROMPT = """Patient {patient} ({pid}), metastatic colorectal cancer.
Read these four synthetic documents:
{paths}

For the MDT minimal dataset (primary diagnosis, TNM stage, metastatic sites, performance status,
KRAS/RAS, BRAF, MMR/MSI, previous treatments), report only what needs a human decision:
1. Values where the sources contradict each other.
2. Values that are only implied and must stay uncertain.
3. Values that are missing altogether.
Quote the original sentence and give its English translation for each point."""


@router.get("/case")
async def case() -> dict[str, Any]:
    """Patient, the four multilingual source documents, and the extracted minimal dataset."""
    documents = []
    for doc in DOCUMENTS:
        try:
            text = sample_data.read_text(doc["path"])
        except FileNotFoundError:
            text = ""
        documents.append({**doc, "text": text})
    return {"patient": PATIENT, "documents": documents, "fields": FIELDS}


def _demo_review(note: str | None) -> AgentResult:
    """Deterministic review so the walkthrough works without a Copilot token."""
    documents = {doc["id"]: doc for doc in DOCUMENTS}
    needs_decision = [f for f in FIELDS if f["status"] != "ok"]
    alerts = [
        UIItem(
            label=f"{field['label']}: {field['suggested']}",
            detail=field["issue"],
            severity="critical" if field["status"] == "conflict" else "warning",
        )
        for field in needs_decision
    ]
    evidence = [
        UIItem(
            label=item["translation"],
            detail=f"Original ({documents[item['document']]['language']}): “{item['quote']}”",
            source=documents[item["document"]]["path"],
        )
        for field in needs_decision
        for item in field["evidence"]
    ]
    return AgentResult(
        mode="fallback",
        headline="3 of 8 dataset values need a human decision",
        blocks=[
            UIBlock(
                type="alert",
                title="Before the tumour board",
                severity="warning",
                body="Everything else was extracted from the four reports and is ready to confirm.",
                items=alerts,
            ),
            UIBlock(type="evidence", title="Original sentences behind these points", items=evidence),
        ],
        trace=[TraceStep(tool="read_sample_data", arguments=doc["path"]) for doc in DOCUMENTS],
        note=note,
    )


@router.post("/review")
async def review() -> AgentResult:
    """Ask the Copilot SDK agent to explain the conflicts, implied values and gaps."""
    paths = "\n".join(f"- {doc['path']} ({doc['language']}, {doc['kind']}, {doc['hospital']})" for doc in DOCUMENTS)
    prompt = PROMPT.format(patient=PATIENT["name"], pid=PATIENT["id"], paths=paths)
    request = AgentRequest(task=prompt, role="MDT coordinator")
    result = await run_agent(request, system_prompt=SYSTEM_PROMPT, prompt=prompt)
    if result.mode == "fallback":
        return _demo_review(result.note)
    return result
