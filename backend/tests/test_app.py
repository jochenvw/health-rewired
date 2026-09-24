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


def test_trials_endpoint_returns_structured_criteria(client):
    trials = client.get("/api/trials").json()
    trial_ids = {t["trial_id"] for t in trials}
    assert "SYN-LU-310" in trial_ids
    lung_trial = next(t for t in trials if t["trial_id"] == "SYN-LU-310")
    assert lung_trial["requires_regimen_keyword"] == "osimertinib"


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


def test_cohort_classifies_eligible_ineligible_and_unknown(client):
    response = client.post(
        "/api/agent/run",
        json={
            "task": "Build the cohort",
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
        "/api/agent/run",
        json={
            "task": "Build the cohort",
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
        "/api/agent/run",
        json={
            "task": "Build the cohort",
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
        "/api/agent/run",
        json={
            "task": "Build the cohort",
            "trial_id": "NOT-A-TRIAL",
            "treatment": "x",
            "subgroup": "y",
            "outcome": "lab trend",
        },
    )
    assert response.status_code == 200
    assert response.json()["blocks"][0]["type"] == "alert"


def test_cohort_engine_never_declares_causality():
    from app.agent import cohort

    result = cohort.build_cohort("SYN-CRC-120", "surveillance", "resected stage III", "lab trend")
    assert "not evidence that a treatment caused" in result.caveat
