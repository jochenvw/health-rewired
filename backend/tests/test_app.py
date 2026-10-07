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


def test_tacit_knowledge_capture_preserves_provenance_in_demo_fallback(client):
    explanation = "The patient has poor cardiopulmonary reserve and is unlikely to tolerate major surgery."
    response = client.post(
        "/api/ideas/98/capture",
        json={"explanation": explanation},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "fallback"
    assert body["original_explanation"] == explanation
    assert body["concept"] == "Operative physiological reserve"
    assert body["status"] == "Hypothesised"
    assert body["evidence_timing"].startswith("Recorded after the decision")
    assert body["created_by"] == "Treating clinician · agent elicitation"
    assert body["result"]["mode"] == "fallback"


def test_tacit_analysis_generates_synthetic_comparisons_and_metrics(client):
    response = client.get("/api/ideas/98/analysis?size=200")

    assert response.status_code == 200
    body = response.json()
    assert body["synthetic"] is True
    assert body["size"] == body["metrics"]["episodes_analysed"] == 200
    assert len(body["comparison"]["cases"]) == 5
    assert all(case["similarity"] >= 70 for case in body["comparison"]["cases"])
    assert all(case["decision"] == "Immediate surgery" for case in body["comparison"]["cases"])
    assert all("caregiver" not in case["evidence_available_at_decision"] for case in body["comparison"]["cases"])
    assert all(factor["counterexample_count"] > 0 for factor in body["factors"])
    assert body["metrics"]["unexplained_rate"] >= 0
    assert body["factors"][0]["examples"][0]["available_at_decision"] is False
    reverse = client.get(
        "/api/ideas/98/analysis",
        params={"size": 200, "current_decision": "Immediate surgery"},
    ).json()
    assert reverse["comparison"]["current_episode"]["decision"] == "Immediate surgery"
    assert all(case["decision"] == "Systemic therapy first" for case in reverse["comparison"]["cases"])


def test_tacit_analysis_counts_change_only_after_human_validation(client):
    path = "/api/ideas/98/analysis"
    before = client.get(path, params={"size": 200}).json()
    validated = client.get(
        path,
        params={"size": 200, "validated_concepts": before["factors"][0]["concept"]},
    ).json()

    assert validated["metrics"]["validated_factors"] == 1
    assert (
        validated["metrics"]["unexplained_after_validated_factors"]
        < before["metrics"]["unexplained_after_validated_factors"]
    )
