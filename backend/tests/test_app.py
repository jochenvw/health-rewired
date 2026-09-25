import pytest
from fastapi.testclient import TestClient

from app.agent import runner
from app.agent.tools import build_render_ui_tool
from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_status_reports_copilot_mode(client):
    body = client.get("/api/status").json()
    assert body["copilot"]["auth_mode"] == "not-configured"
    assert body["sample_data_files"] >= 3


def test_sample_data_is_listed_and_path_safe(client):
    files = client.get("/api/sample-data").json()
    assert "patients/P-001.json" in files
    assert client.get("/api/sample-data/patients/P-001.json").json()["synthetic"] is True
    assert client.get("/api/sample-data/../pyproject.toml").status_code == 404


def test_agent_falls_back_without_token(client):
    response = client.post("/api/agent/run", json={"task": "Prepare this case for the MDT", "patient_id": "P-002"})
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "fallback"
    types = {block["type"] for block in body["blocks"]}
    assert {"patient_card", "timeline", "actions"} <= types
    assert any(step["tool"] == "get_patient" for step in body["trace"])


def test_render_ui_tool_schema_is_self_contained():
    captured = []
    tool = build_render_ui_tool(captured.append)
    assert "$defs" not in str(tool.parameters)
    assert tool.is_terminal


def test_runner_uses_fallback_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    import asyncio

    result = asyncio.run(runner.run_agent(runner.AgentRequest(task="Check P-003")))
    assert result.mode == "fallback"


def test_unescape_restores_double_escaped_unicode():
    from app.agent.runner import _unescape

    assert _unescape({"a": ["CEA 2.1\\u21924.6"], "b": 1}) == {"a": ["CEA 2.1\u21924.6"], "b": 1}


def test_idea_routers_are_discovered_and_mounted(client):
    from fastapi import APIRouter

    from app.ideas import routers

    def _all_paths(routes) -> set[str]:
        paths: set[str] = set()
        for route in routes:
            path = getattr(route, "path", None)
            if path:
                paths.add(path)
            nested = getattr(route, "routes", None) or getattr(getattr(route, "original_router", None), "routes", None)
            if nested:
                paths |= _all_paths(nested)
        return paths

    found = routers()
    assert all(isinstance(r, APIRouter) for r in found)
    mounted = _all_paths(app.routes)
    for router in found:
        assert {route.path for route in router.routes} <= mounted


def test_issue_54_worklist_ranks_myocarditis_signal(client):
    response = client.get("/api/ideas/54/worklist")
    body = response.json()
    assert response.status_code == 200
    assert body["synthetic"] is True
    assert len(body["patients"]) == 10
    assert body["patients"][0]["id"] == "IOT-5401"
    assert body["patients"][0]["organ_signal"] == "Possible myocarditis"
    assert "troponin" in body["patients"][0]["grade_rationale"].lower()


def test_issue_54_assistant_has_demo_path_without_copilot(client):
    response = client.post("/api/ideas/54/assistant", json={"patient_id": "IOT-5401", "action": "same-day"})
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "fallback"
    assert any(block["type"] == "actions" for block in body["blocks"])
    assert any(step["tool"] == "load_issue54_triage_case" for step in body["trace"])
    assert "myocarditis" in body["blocks"][0]["title"].lower()
