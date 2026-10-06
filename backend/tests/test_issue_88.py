from fastapi.testclient import TestClient

from app.agent.models import AgentResult
from app.config import settings
from app.ideas import issue_88
from app.main import app


def test_request_front_door_without_copilot(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)
    catalogue = client.get("/api/ideas/88/catalogue").json()
    assert catalogue["synthetic"]
    assert catalogue["catalogue"]["@type"] == "dcat:Catalog"
    assert next(v for v in catalogue["variables"] if v["id"] == "stage")["likely_source"] == "report text"
    intake = {
        "request": "Stage III colorectal cancer, age, adjuvant regimen and overall survival.",
        "purpose": "Compare outcomes",
        "permit": "",
        "horizon": "future",
    }
    response = client.post("/api/ideas/88/assess", json=intake)
    assert response.status_code == 200
    body = response.json()
    assert body["agent"]["mode"] == "fallback"
    assert body["assessment"]["patient_count"] == 128
    assert body["assessment"]["reuse"]["id"] == "EXT-024"
    assert body["assessment"]["permit_status"] == "Missing permit reference"
    assert "patient_card" not in {b["type"] for b in body["agent"]["blocks"]}

    six_months = client.post("/api/ideas/88/assess", json={**intake, "horizon": "six-months"}).json()["assessment"]
    assert six_months["reuse"] is None
    assert next(v for v in six_months["mapped"] if v["id"] == "stage")["status"] == "conditional"
    incomplete = client.post(
        "/api/ideas/88/assess",
        json={**intake, "purpose": "", "permit": "DEMO-PERMIT", "request": intake["request"] + " Whole-slide images."},
    ).json()["assessment"]
    assert incomplete["reuse"] is None
    assert "Whole-slide pathology images" in incomplete["missing_variables"]
    assert incomplete["permit_status"] == "Reference supplied — not verified"
    assert any("Missing purpose" in flag for flag in incomplete["flags"])
    restricted = client.post(
        "/api/ideas/88/assess", json={**intake, "request": "Stage III colorectal patients older than 70"}
    ).json()["assessment"]
    assert restricted["patient_count"] is None
    assert restricted["reuse"] is None
    unsupported_stage = client.post(
        "/api/ideas/88/assess", json={**intake, "request": "Stage IIIA colorectal cancer"}
    ).json()["assessment"]
    assert unsupported_stage["patient_count"] is None
    clinic_outcomes = client.post(
        "/api/ideas/88/assess", json={**intake, "request": intake["request"] + " Quality of life."}
    ).json()["assessment"]
    assert "Quality of life" in clinic_outcomes["missing_variables"]
    assert clinic_outcomes["reuse"] is None

    async def sdk_without_tool(*args, **kwargs):
        return AgentResult(mode="copilot", headline="Text-only response", blocks=[])

    monkeypatch.setattr(issue_88, "run_agent", sdk_without_tool)
    ungrounded = client.post("/api/ideas/88/assess", json=intake).json()
    assert ungrounded["agent"]["mode"] == "fallback"
    assert "did not complete the feasibility tool" in ungrounded["agent"]["note"]
