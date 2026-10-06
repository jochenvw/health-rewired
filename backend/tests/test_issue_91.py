import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.ideas.issue_91 import lab_events
from app.main import app


def test_safety_walkthrough_without_token(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)
    data = client.get("/api/ideas/91/monitor").json()
    assert data["synthetic"]
    drug = data["drugs"][0]
    assert len(drug["patients"]) == 12
    assert drug["comparisons"][0]["count"] == 4
    assert drug["comparisons"][0]["grades"] == {"1": 0, "2": 2, "3": 2, "4": 0}
    assert drug["comparisons"][2]["count"] == 2
    assert any(c["name"] == "Liver function" and c["likely_source"] == "structured" for c in data["coverage"])
    response = client.post("/api/ideas/91/agent", json={"drug_id": "immune-a"})
    assert response.status_code == 200
    result = response.json()
    assert result["mode"] == "fallback"
    assert "3/4" in result["blocks"][-1]["body"]
    assert "5 stools/day over baseline" in str(result["blocks"])
    assert "nothing has been submitted" in result["blocks"][-1]["body"]
    near = client.get("/api/ideas/91/monitor?horizon=six-months").json()["drugs"][0]
    assert all("note" not in p and "admission" not in p for p in near["patients"])
    assert all(c["trial_rate"] is None for c in near["comparisons"])
    near_result = client.post("/api/ideas/91/agent", json={"horizon": "six-months"}).json()
    assert near_result["blocks"][-1]["title"] == "Lab monitoring summary"
    assert "5 stools/day" not in str(near_result)
    assert client.post("/api/ideas/91/agent", json={"drug_id": "unknown"}).status_code == 404


@pytest.mark.parametrize(
    ("alt", "anc", "grades"),
    [(40, 1.8, []), (120, 1.5, [1, 1]), (200, 1.0, [2, 2]), (800, 0.5, [3, 3]), (801, 0.4, [4, 4])],
)
def test_candidate_lab_grade_boundaries(alt, anc, grades):
    patient = {
        "start": "2026-07-01",
        "lab_date": "2026-08-01",
        "baseline_alt": 25,
        "alt": alt,
        "alt_uln": 40,
        "anc": anc,
    }
    assert [e["grade"] for e in lab_events(patient)] == grades
    patient["lab_date"] = "2026-06-01"
    assert lab_events(patient) == []


def test_sdk_review_receives_horizon_specific_evidence(monkeypatch):
    from app.agent import AgentResult
    from app.agent.ui import UIBlock
    from app.ideas import issue_91

    captured = []

    async def fake_agent(request, **kwargs):
        captured.append(kwargs)
        return AgentResult(
            mode="copilot",
            headline="SDK review",
            blocks=[UIBlock(type="summary", title="Periodic safety report", body="Reviewed synthetic evidence.")],
        )

    monkeypatch.setattr(issue_91, "run_agent", fake_agent)
    client = TestClient(app)
    result = client.post("/api/ideas/91/agent", json={"horizon": "future"}).json()
    assert result["mode"] == "copilot"
    assert result["blocks"][0]["body"] == "Reviewed synthetic evidence."
    assert "5 stools/day over baseline" in captured[-1]["prompt"]
    assert "render_ui" in captured[-1]["system_prompt"]
    client.post("/api/ideas/91/agent", json={"horizon": "six-months"})
    assert "5 stools/day" not in captured[-1]["prompt"]
    assert '"trial_rate": null' in captured[-1]["prompt"]
