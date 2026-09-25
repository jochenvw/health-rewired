import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_case_returns_dna_report_and_screening(client):
    body = client.get("/api/ideas/55/case").json()
    assert body["patient"]["id"] == "P-004"
    assert "ERBB2" in body["dna_report"]
    assert len(body["screening"]["shortlist"]) == 3


def test_three_countries_one_match_one_excluded_one_blocked(client):
    screening = client.post("/api/ideas/55/match", json={"answers": {}}).json()
    verdicts = {t["country"]: t["verdict"] for t in screening["shortlist"]}
    assert verdicts == {"Germany": "excluded", "Italy": "blocked", "Netherlands": "match"}
    assert screening["missing"][0]["fact"] == "lvef"


def test_adding_the_missing_value_turns_the_blocked_trial_into_a_match(client):
    screening = client.post("/api/ideas/55/match", json={"answers": {"lvef": "62"}}).json()
    italy = next(t for t in screening["shortlist"] if t["country"] == "Italy")
    assert italy["verdict"] == "match"
    assert all(c["status"] != "unknown" for c in italy["criteria"])


def test_interpretation_and_referral_work_without_a_copilot_token(client):
    interpretation = client.post("/api/ideas/55/interpret").json()
    assert interpretation["mode"] == "fallback"
    assert {b["type"] for b in interpretation["blocks"]} == {"summary", "evidence", "alert"}

    referral = client.post(
        "/api/ideas/55/referral", json={"trial_id": "SYN-EU-HER2-IT-14", "answers": {"lvef": "62"}}
    ).json()
    assert "Milano" in referral["headline"]
    assert any("bozza" in (block.get("body") or "") for block in referral["blocks"])
    assert any(block["type"] == "actions" for block in referral["blocks"])
