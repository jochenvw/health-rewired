import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.ideas.issue_90 import assess
from app.main import app


def test_access_desk_walkthrough_without_copilot(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    with TestClient(app) as client:
        data = client.get("/api/ideas/90/desk").json()
        assert data["synthetic"]
        assert len(data["suggestion"]["evidence_ids"]) == 3
        body = client.post("/api/ideas/90/assess", json={"request_id": "MDT-041"}).json()
        assert body["status"] == "approved"
        assert body["rule_id"] == "MDT-01"
        assert all(check["passed"] for check in body["checks"])
        assert body["agent"]["mode"] == "fallback"
        assert body["agent"]["blocks"][0]["title"] == "Structured request · demo extraction"
        research = client.post("/api/ideas/90/assess", json={"request_id": "RES-018"}).json()
        assert research["status"] == "review"
        assert research["rule_id"] == "QUA-01"
        assert len(research["differences"]) == 1
        assert "research" in research["differences"][0]
        assert client.post("/api/ideas/90/assess", json={"request_id": "unknown"}).status_code == 404


@pytest.mark.parametrize(
    ("request_id", "future", "six_months"),
    [
        ("MDT-041", "approved", "approved"),
        ("QUA-022", "approved", "approved"),
        ("RES-018", "review", "unavailable"),
        ("FED-009", "review", "unavailable"),
        ("CON-007", "review", "unavailable"),
    ],
)
def test_only_matching_requests_are_automated(request_id, future, six_months):
    assert assess(request_id)["status"] == future
    assert assess(request_id, "six-months")["status"] == six_months
