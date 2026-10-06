from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_zero_trust_walkthrough(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)

    def review(action, **kwargs):
        response = client.post("/api/ideas/89/review", json={"action": action, **kwargs})
        assert response.status_code == 200
        return response.json()

    granted = review("read")
    assert granted["decision"]["outcome"] == "Granted"
    assert set(granted["decision"]["data"]) == {element["name"] for element in granted["coverage"]}
    assert granted["decision"]["expires_at"] is not None
    assert len(granted["roster"]) == 3
    note = review("note", explain=True)
    assert note["decision"]["outcome"] == "Quarantined"
    assert note["explanation"]["mode"] == "fallback"
    for action in ("outside", "bulk", "retry"):
        blocked = review(action)["decision"]
        assert blocked["outcome"] == "Denied"
        assert blocked["data"] == {}
        assert blocked["expires_at"] is None
    assert review("stop")["decision"]["outcome"] == "Stopped"
    assert review("note", horizon="six-months")["decision"]["outcome"] == "Unavailable"
    assert client.post("/api/ideas/89/review", json={"action": "export"}).status_code == 422


def test_supervisor_has_no_patient_read_tools(monkeypatch):
    from app.agent.models import AgentResult
    from app.ideas import issue_89

    async def fake_agent(request, **kwargs):
        assert kwargs["data_tools"] == []
        assert len(kwargs["extra_tools"]) == 1
        assert kwargs["extra_tools"][0].name == "inspect_access_decision"
        return AgentResult(mode="copilot", headline="Decision explained", blocks=[])

    monkeypatch.setattr(settings, "copilot_use_logged_in_user", True)
    monkeypatch.setattr(issue_89, "run_agent", fake_agent)
    response = TestClient(app).post("/api/ideas/89/review", json={"action": "note", "explain": True})
    assert response.json()["explanation"]["mode"] == "copilot"
