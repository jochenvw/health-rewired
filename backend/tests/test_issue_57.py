from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_issue_57_feasibility_snapshot_has_six_centres(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)

    body = client.get("/api/ideas/57/feasibility").json()

    assert body["synthetic"] is True
    assert len(body["centres"]) == 6
    assert body["totals"]["adjusted_eligible"] > body["totals"]["strict_eligible"]
    assert body["disparities"][0]["strict_excluded_by_egfr"] == 49


def test_issue_57_agent_falls_back_to_trial_specific_review(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)

    response = client.post(
        "/api/ideas/57/agent",
        json={"task": "mCRC second-line; ECOG 0-1; eGFR at least 60; exclude uncontrolled comorbidity"},
    )
    body = response.json()

    assert response.status_code == 200
    assert body["mode"] == "fallback"
    assert "trial rules" in body["headline"]
    assert any(step["tool"] == "federated_trial_feasibility" for step in body["trace"])
    assert any("49%" in (block.get("body") or "") for block in body["blocks"])
