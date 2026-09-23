import os
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException

from app.models import CommunicationPreferences, MDODecision, PatientCase


REQUIRED_DECISION_FIELDS = ("outcomes", "rationale", "actions")

DEMO_CASE = PatientCase(
    id="SYN-MDO-024",
    synthetic=True,
    patient_name="Alex Morgan",
    age=57,
    diagnosis="Stage IIIA non-small cell lung cancer (adenocarcinoma)",
    decision_question="What is the safest next treatment after initial chemotherapy and radiotherapy?",
    facts=[
        {
            "id": "path-1",
            "label": "Pathology",
            "value": "Adenocarcinoma; PD-L1 tumour proportion score 60%.",
            "source": "Synthetic pathology report · 18 Sep 2026",
        },
        {
            "id": "img-1",
            "label": "Imaging",
            "value": "CT shows partial response and no new distant disease.",
            "source": "Synthetic CT report · 20 Sep 2026",
        },
        {
            "id": "lab-1",
            "label": "Relevant test",
            "value": "EGFR, ALK and ROS1 driver alterations were not detected.",
            "source": "Synthetic molecular report · 19 Sep 2026",
        },
        {
            "id": "note-1",
            "label": "Clinical context",
            "value": "The patient completed concurrent chemotherapy and radiotherapy with manageable fatigue.",
            "source": "Synthetic oncology note · 21 Sep 2026",
        },
    ],
    contact="Thoracic oncology specialist nurse via the hospital oncology number",
)

DEMO_DECISION = MDODecision(
    outcomes=["Continue treatment", "Request diagnostics"],
    rationale=(
        "The board recommends discussing consolidation immunotherapy because imaging shows a "
        "partial response, no distant progression is reported, and no targetable driver alteration "
        "is documented."
    ),
    disagreements="No disagreement on the proposed next step.",
    unresolved_questions="Confirm current performance status and screen for treatment contraindications.",
    missing_evidence="Current pulmonary function and performance-status assessment.",
    actions=[
        {"action": "Arrange oncology review and contraindication screen", "owner": "Medical oncologist", "due": "Within 7 days"},
        {"action": "Confirm pulmonary function results", "owner": "Specialist nurse", "due": "Before oncology review"},
    ],
    status="approved",
    approved_by="Dr Sam Taylor (synthetic)",
)


def missing_decision_fields(decision: MDODecision) -> list[str]:
    missing: list[str] = []
    for field in REQUIRED_DECISION_FIELDS:
        value = getattr(decision, field)
        if not value:
            missing.append(field)
    if any(not action.owner.strip() or not action.action.strip() for action in decision.actions):
        missing.append("action owners")
    if decision.missing_evidence.strip() and not decision.unresolved_questions.strip():
        missing.append("unresolved questions")
    return missing


def validate_decision(decision: MDODecision) -> list[str]:
    missing = missing_decision_fields(decision)
    if decision.status == "approved":
        if not decision.approved_by:
            missing.append("approving clinician")
        if missing and not decision.override_missing:
            raise HTTPException(
                status_code=422,
                detail={"message": "Approval blocked until required information is complete.", "missing": missing},
            )
    return missing


def _fact_text(case: PatientCase) -> str:
    return " ".join(f"{fact.label}: {fact.value}" for fact in case.facts)


def generate_documents(
    case: PatientCase,
    decision: MDODecision,
    preferences: CommunicationPreferences,
) -> dict[str, Any]:
    validate_decision(decision)
    if decision.status != "approved":
        raise HTTPException(status_code=409, detail="Generated communications require a clinician-approved decision.")

    sources = [{"statement": fact.value, "source_id": fact.id, "source": fact.source} for fact in case.facts]
    actions = "; ".join(f"{item.action} — {item.owner} ({item.due})" for item in decision.actions)
    uncertainty = decision.unresolved_questions or "No unresolved question was recorded."
    missing = decision.missing_evidence or "No missing evidence was recorded."

    detail = {
        "simple": "Some medical words are included below and should be explained by the clinical team.",
        "standard": "This summary uses plain language while retaining the key clinical details.",
        "detailed": "This detailed summary includes the recorded test terminology and decision rationale.",
    }[preferences.literacy]
    language_labels = {
        "German": ("Was wir über die Erkrankung wissen", "Untersuchungen und Ergebnisse", "Was das MDO besprochen und entschieden hat", "Was noch unklar ist", "Nächste Schritte", "Fragen"),
        "French": ("Ce que nous savons de la maladie", "Examens et résultats", "Discussion et décision de la RCP", "Incertitudes restantes", "Prochaines étapes", "Questions"),
        "Spanish": ("Lo que sabemos de la enfermedad", "Pruebas y resultados", "Discusión y decisión del comité", "Aspectos aún inciertos", "Próximos pasos", "Preguntas"),
    }
    headings = language_labels.get(
        preferences.language,
        ("What we know about the illness", "Tests and results", "What the MDO discussed and decided", "What remains uncertain or missing", "Expected next steps", "Questions"),
    )
    recorded_outcomes = ", ".join(decision.outcomes) or "Not recorded (clinician override confirmed)."
    recorded_rationale = decision.rationale or "No rationale recorded (clinician override confirmed)."
    actions = actions or "No action recorded (clinician override confirmed)."
    age_note = "The wording is intended for a young person and their caregiver." if preferences.age_appropriate and case.age < 18 else "The wording is intended for an adult patient."
    patient_summary = (
        f"DRAFT — clinician review required\n\n{headings[0]}\n{case.diagnosis}.\n\n"
        f"{headings[1]}\n{_fact_text(case)}\n\n{headings[2]}\n"
        f"{recorded_rationale} The recorded outcomes are: {recorded_outcomes}.\n\n"
        f"{headings[3]}\n{uncertainty} {missing}\n\n{headings[4]}\n{actions}\n\n"
        f"{headings[5]}\nContact {case.contact}.\n\nCommunication settings: {preferences.language}; "
        f"{preferences.literacy}; accessibility: {preferences.accessibility}. {age_note} {detail}"
    )
    note = (
        f"CLINICIAN-APPROVED MDO DECISION\nCase: {case.id}\nClinical context: {case.diagnosis}. "
        f"Evidence reviewed: {_fact_text(case)}\nDecision: {recorded_outcomes}.\n"
        f"Rationale: {recorded_rationale}\nDisagreement/uncertainty: {decision.disagreements}; {uncertainty}\n"
        f"Outstanding evidence: {missing}\nActions: {actions}\nApproved by: {decision.approved_by}."
    )
    letter = (
        f"DRAFT POST-MDO LETTER — clinician review required\n\nRe: {case.patient_name} ({case.id})\n\n"
        f"Clinical context\n{case.diagnosis}.\n\nEvidence reviewed\n{_fact_text(case)}\n\n"
        f"Human board decision\n{recorded_outcomes}.\n\nSupporting rationale\n{recorded_rationale}\n\n"
        f"Disagreements and uncertainty\n{decision.disagreements or 'None recorded.'} {uncertainty}\n\n"
        f"Outstanding investigations\n{missing}\n\nFollow-up\n{actions}\n\n"
        f"Approved by {decision.approved_by}. Evidence summaries above are machine-formatted from "
        "the cited case facts; the decision is the human board's approved decision."
    )
    return {
        "patient_summary": patient_summary,
        "medical_record_note": note,
        "referrer_letter": letter,
        "provenance": sources,
        "generated_at": datetime.now(UTC).isoformat(),
        "draft": True,
        "read_aloud": preferences.read_aloud,
    }


def voice_config() -> list[dict[str, Any]]:
    roles = {
        "chair": "MDO chair",
        "oncologist": "Medical oncologist",
        "radiologist": "Radiologist",
        "pathologist": "Pathologist",
        "surgeon": "Surgeon",
        "radiation_oncologist": "Radiation oncologist",
        "nurse": "Specialist nurse",
        "trials": "Clinical-trial specialist",
    }
    return [
        {
            "role": key,
            "name": name,
            "persona": f"{name}: concise, evidence-grounded and collaborative",
            "voice_id": os.getenv(f"ELEVENLABS_VOICE_{key.upper()}", ""),
            "provider": "ElevenLabs" if os.getenv(f"ELEVENLABS_VOICE_{key.upper()}") else "Browser fallback",
        }
        for key, name in roles.items()
    ]


def build_discussion(case: PatientCase, detailed: bool = False) -> list[dict[str, Any]]:
    facts = {fact.id: fact for fact in case.facts}
    turns = [
        {"sequence": 0, "role": "chair", "kind": "chair", "text": case.decision_question, "source_id": None},
        {"sequence": 1, "role": "radiologist", "kind": "agent", "text": facts.get("img-1").value if facts.get("img-1") else "Imaging unavailable.", "source_id": "img-1"},
        {"sequence": 2, "role": "pathologist", "kind": "agent", "text": facts.get("path-1").value if facts.get("path-1") else "Pathology unavailable.", "source_id": "path-1"},
    ]
    if detailed:
        turns.append({"sequence": 3, "role": "nurse", "kind": "agent", "text": f"Patient contact: {case.contact}", "source_id": None})
    turns.append({
        "sequence": len(turns),
        "role": "chair",
        "kind": "chair_summary",
        "text": "Discussion complete. Capture and approve the human board decision.",
        "source_id": None,
    })
    return turns
