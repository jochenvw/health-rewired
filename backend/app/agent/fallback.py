"""Deterministic response used when the Copilot SDK is not configured or fails.

It follows the same UI-block contract as the live agent, so the frontend and demos keep working.
"""

from app import sample_data
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.ui import UIBlock, UIItem


def _cancer_type(primary: str) -> str:
    primary = primary.lower()
    for keyword, kind in (("breast", "breast"), ("lung", "lung"), ("colon", "colorectal"), ("rect", "colorectal")):
        if keyword in primary:
            return kind
    return ""


def build_fallback(request: AgentRequest, note: str) -> AgentResult:
    patients = sample_data.list_patients()
    patient_id = request.patient_id or (patients[0]["id"] if patients else None)
    trace = [TraceStep(tool="list_sample_data")]
    if not patient_id:
        return AgentResult(
            mode="fallback",
            headline="No sample data found",
            blocks=[UIBlock(type="alert", title="Sample data missing", body="Add files to /sample-data.")],
            trace=trace,
            note=note,
        )

    record = sample_data.get_patient(patient_id)
    source = f"patients/{patient_id}.json"
    trace.append(TraceStep(tool="get_patient", arguments=patient_id))
    diagnosis = record.get("diagnosis", {})

    facts = [
        UIItem(label="Diagnosis", detail=diagnosis.get("primary"), source=source),
        UIItem(label="Stage", detail=diagnosis.get("stage"), source=source),
        *(UIItem(label=k, detail=v, source=source) for k, v in diagnosis.get("biomarkers", {}).items()),
        UIItem(label="ECOG", detail=str(record.get("ecog")), source=source),
    ]
    alerts = [
        UIItem(
            label=f"{lab['test']} {lab['value']} {lab['unit']}",
            detail=f"{lab['flag']} on {lab['date']}",
            severity="warning",
        )
        for lab in record.get("labs", [])
        if lab.get("flag")
    ] + [UIItem(label=q, severity="critical") for q in record.get("open_questions", [])]

    kind = _cancer_type(diagnosis.get("primary", ""))
    trials = [t for t in sample_data.read("trials.csv") if t["cancer_type"] == kind]
    trace.append(TraceStep(tool="read_sample_data", arguments="trials.csv"))

    blocks = [
        UIBlock(
            type="patient_card",
            title=f"{record.get('name')} · {record.get('age')} y",
            items=[f for f in facts if f.detail],
        ),
        UIBlock(
            type="timeline",
            title="Care journey",
            items=[UIItem(label=e["event"], date=e["date"]) for e in record.get("timeline", [])],
        ),
    ]
    if alerts:
        blocks.append(UIBlock(type="alert", title="Needs attention", severity="warning", items=alerts))
    if trials:
        blocks.append(
            UIBlock(
                type="evidence",
                title="Possibly relevant synthetic trials",
                items=[
                    UIItem(
                        label=f"{t['trial_id']}: {t['title']}",
                        detail=f"Inclusion: {t['key_inclusion']}",
                        source="trials.csv",
                    )
                    for t in trials
                ],
            )
        )
    blocks.append(
        UIBlock(
            type="actions",
            title="Proposed next steps (human decision)",
            items=[UIItem(label=q, detail="Proposed by rules, not by AI") for q in record.get("open_questions", [])]
            or [UIItem(label="Review the case at the next MDT")],
        )
    )
    return AgentResult(
        mode="fallback",
        headline=f"Case overview for {patient_id} (deterministic demo)",
        blocks=blocks,
        trace=trace,
        note=note,
    )
