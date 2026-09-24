import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.ideas.issue_37 import _is_comparable, _query_eu_network
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_is_comparable_matches_egfr_mutant_oligometastatic_lung_only():
    patient = {"diagnosis": {"primary": "Adenocarcinoma of the lung", "biomarkers": {"EGFR": "exon 19 deletion"}}}
    matching_case = {
        "primary": "Lung adenocarcinoma",
        "biomarkers": {"EGFR": "L858R"},
        "stage_group": "IV_oligometastatic",
    }
    assert _is_comparable(patient, matching_case) is True

    wrong_biomarker = {**matching_case, "biomarkers": {"EGFR": "negative"}}
    assert _is_comparable(patient, wrong_biomarker) is False

    wrong_stage = {**matching_case, "stage_group": "IV_widespread"}
    assert _is_comparable(patient, wrong_stage) is False

    wrong_cancer = {**matching_case, "primary": "Breast carcinoma"}
    assert _is_comparable(patient, wrong_cancer) is False


def test_query_eu_network_tool_finds_comparable_patients_and_flags_evidence():
    import json

    from app.ideas.issue_37 import PatientIdParams

    result = _query_eu_network(PatientIdParams(patient_id="P-002"))
    body = json.loads(result)
    assert body["matched_total"] > 0
    assert body["approaches"]
    assert any("approach" in a and a["n"] > 0 for a in body["approaches"])
    assert body["evidence_flags"]
    assert "no raw patient records" in body["privacy_note"]


def test_prepare_outcome_feedback_drafts_without_saving():
    import json

    from app.ideas.issue_37 import _LEARNING_LOG, PrepareFeedbackParams, _prepare_outcome_feedback

    entries_before = len(_LEARNING_LOG)
    result = _prepare_outcome_feedback(
        PrepareFeedbackParams(
            patient_id="P-002",
            approach_category="biopsy_or_liquid_first",
            chosen_treatment="Liquid biopsy then continue osimertinib",
            outcome_note="Pending",
        )
    )
    body = json.loads(result)
    assert body["draft"] is True
    assert body["approach_label"] == "Confirm with (liquid) biopsy before changing therapy"
    assert body["patient_id"] == "P-002"
    assert len(_LEARNING_LOG) == entries_before


def test_query_endpoint_falls_back_without_token(client):
    response = client.post("/api/ideas/37/query", json={"task": "Find comparable patients", "patient_id": "P-002"})
    assert response.status_code == 200
    assert response.json()["mode"] == "fallback"


def test_feedback_is_only_recorded_on_explicit_call(client):
    assert client.get("/api/ideas/37/log").json() == []
    response = client.post(
        "/api/ideas/37/feedback",
        json={
            "patient_id": "P-002",
            "approach_category": "biopsy_or_liquid_first",
            "chosen_treatment": "Liquid biopsy then continue osimertinib",
            "outcome_note": "Nodule confirmed benign",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_learning_entries"] == 1
    assert client.get("/api/ideas/37/log").json()[0]["patient_id"] == "P-002"


def test_feedback_rejects_unknown_approach_category(client):
    response = client.post(
        "/api/ideas/37/feedback",
        json={"patient_id": "P-002", "approach_category": "not-a-real-category", "chosen_treatment": "x"},
    )
    assert response.status_code == 400


def test_feedback_rejects_invalid_patient_id(client):
    response = client.post(
        "/api/ideas/37/feedback",
        json={"patient_id": "not a valid id!", "approach_category": "biopsy_or_liquid_first", "chosen_treatment": "x"},
    )
    assert response.status_code == 422
