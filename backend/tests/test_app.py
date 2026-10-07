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


def test_issue_74_evidence_review_returns_proposals_without_applying_them(client):
    response = client.post(
        "/api/ideas/74/evidence-review",
        json={
            "patient_id": "P-003",
            "assertions": [
                {
                    "key": "evidence-1234",
                    "label": "Disease",
                    "statement": "Adenocarcinoma of the sigmoid colon",
                    "state": "single-source",
                    "sources": [
                        {
                            "title": "Synthetic oncology record",
                            "hospital": "Utrecht University Medical Center",
                            "date": "2024-06-03",
                            "excerpt": "Diagnosis: Adenocarcinoma of the sigmoid colon",
                        }
                    ],
                },
                {
                    "key": "evidence-5678",
                    "label": "Molecular result",
                    "statement": "Molecular result needs reconciliation",
                    "state": "contradictory",
                    "sources": [
                        {
                            "title": "Pathology report",
                            "hospital": "Utrecht University Medical Center",
                            "date": "2024-06-03",
                            "excerpt": "KRAS G12D detected.",
                        },
                        {
                            "title": "Referral letter",
                            "hospital": "Milan Cancer Centre",
                            "date": "2024-06-03",
                            "excerpt": "KRAS wild type.",
                        },
                    ],
                },
            ],
        },
    )
    body = response.json()
    assert response.status_code == 200
    assert body["result"]["mode"] == "fallback"
    assert {item["outcome"] for item in body["proposals"]} == {"verified", "accepted-a"}
    reconciliation = next(item for item in body["proposals"] if item["outcome"] == "accepted-a")
    assert reconciliation["source_index"] == 0
    assert "Clinician confirmation is required" in reconciliation["rationale"]
    assert all(
        "confirmation is still required" in item["rationale"] or "confirmation is required" in item["rationale"]
        for item in body["proposals"]
    )


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
