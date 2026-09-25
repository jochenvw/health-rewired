"""Smoke tests for idea #48 – confirm the minimal dataset once, reuse it everywhere."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_dataset_flags_conflict_uncertain_and_missing(client):
    body = client.get("/api/ideas/48/dataset/P-048").json()
    fields = {f["id"]: f for f in body["fields"]}
    assert body["counts"]["languages"] == 4
    assert fields["ras_status"]["status"] == "conflict"
    assert fields["ecog"]["status"] == "uncertain"
    assert fields["braf_status"]["status"] == "missing"
    assert "answer_key" not in body
    assert all(f["evidence"][0]["translation"] for f in body["fields"])


def test_scorecard_counts_correct_unknown_and_wrong(client):
    body = client.post(
        "/api/ideas/48/scorecard",
        json={
            "decisions": [
                {"field_id": "ras_status", "value": "KRAS p.G12C mutated", "action": "accepted"},
                {"field_id": "ecog", "value": "Unknown – implied, not scored", "action": "unknown"},
                {"field_id": "msi", "value": "MSI-high", "action": "corrected"},
            ]
        },
    ).json()
    assert (body["correct"], body["unknown"], body["wrong"]) == (1, 1, 1)


def test_agent_falls_back_to_the_same_dataset_without_a_token(client):
    body = client.post("/api/ideas/48/agent", json={"task": "Explain the contradictions"}).json()
    assert body["mode"] == "fallback"
    assert {block["type"] for block in body["blocks"]} == {"alert", "evidence", "actions"}


def test_unknown_patient_is_404(client):
    assert client.get("/api/ideas/48/dataset/P-999").status_code == 404
