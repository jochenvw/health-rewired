"""Tests for issue #27's cohort-explorer idea (backend/app/ideas/issue_27.py)."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_trials_endpoint_returns_structured_criteria(client):
    trials = client.get("/api/ideas/27/trials").json()
    trial_ids = {t["trial_id"] for t in trials}
    assert "SYN-LU-310" in trial_ids
    lung_trial = next(t for t in trials if t["trial_id"] == "SYN-LU-310")
    assert lung_trial["requires_regimen_keyword"] == "osimertinib"


def test_cohort_classifies_eligible_ineligible_and_unknown(client):
    response = client.post(
        "/api/ideas/27/run",
        json={
            "trial_id": "SYN-LU-310",
            "treatment": "osimertinib",
            "subgroup": "EGFR-mutant NSCLC",
            "outcome": "lab trend",
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "fallback"
    types = {block["type"] for block in body["blocks"]}
    assert {"cohort", "evidence", "actions"} <= types
    cohort_block = next(b for b in body["blocks"] if b["type"] == "cohort")
    statuses = {item["label"].split(" · ")[-1] for item in cohort_block["items"]}
    assert statuses == {"ELIGIBLE", "INELIGIBLE"}
    assert all(item["source"].startswith("patients/") for item in cohort_block["items"])


def test_cohort_reports_unknown_when_biomarker_pending(client):
    response = client.post(
        "/api/ideas/27/run",
        json={
            "trial_id": "SYN-BR-101",
            "treatment": "CDK4/6i",
            "subgroup": "HR+",
            "outcome": "lab trend",
        },
    )
    cohort_block = next(b for b in response.json()["blocks"] if b["type"] == "cohort")
    p001 = next(item for item in cohort_block["items"] if item["label"].startswith("P-001"))
    assert "UNKNOWN" in p001["label"]
    assert p001["severity"] == "warning"


def test_cohort_simulate_adds_what_changed_block(client):
    response = client.post(
        "/api/ideas/27/run",
        json={
            "trial_id": "SYN-CRC-120",
            "treatment": "surveillance",
            "subgroup": "resected stage III",
            "outcome": "lab trend",
            "simulate": True,
        },
    )
    blocks = response.json()["blocks"]
    assert any(b["title"] == "What changed after simulated follow-up" for b in blocks)


def test_cohort_unknown_trial_id_is_handled(client):
    response = client.post(
        "/api/ideas/27/run",
        json={
            "trial_id": "NOT-A-TRIAL",
            "treatment": "x",
            "subgroup": "y",
            "outcome": "lab trend",
        },
    )
    assert response.status_code == 200
    assert response.json()["blocks"][0]["type"] == "alert"


def test_cohort_engine_never_declares_causality():
    from app.ideas import issue_27_cohort as cohort

    result = cohort.build_cohort("SYN-CRC-120", "surveillance", "resected stage III", "lab trend")
    assert "not evidence that a treatment caused" in result.caveat
