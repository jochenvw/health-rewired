from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_issue_53_quality_snapshot(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)

    response = client.get("/api/ideas/53/quality-snapshot")
    body = response.json()

    assert response.status_code == 200
    assert body["synthetic"] is True
    assert body["signal"]["hospital_id"] == "F"
    assert body["signal"]["likely_cause"] == "MRI waiting time"
    assert len(body["hospitals"]) == 8
    assert len(body["audit_cases"]) == 5


def test_issue_53_assistant_falls_back_without_token(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)

    response = client.post("/api/ideas/53/assistant", json={"task": "Investigate Hospital F", "role": "Chair"})
    body = response.json()

    assert response.status_code == 200
    assert body["mode"] == "fallback"
    assert "MRI waiting time" in body["headline"]
    assert any(step["tool"] == "get_rectal_quality_signal" for step in body["trace"])
