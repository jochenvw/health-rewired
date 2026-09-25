import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_case_exposes_language_preference_and_sources(client):
    case = client.get("/api/ideas/52/case/P-010").json()
    assert case["communication"]["preferred_language"] == "nl"
    assert {s["id"] for s in case["sources"]} == {"mdt", "mri", "pathology"}
    assert "mrTRG 2" in next(s["text"] for s in case["sources"] if s["id"] == "mri")
    assert client.get("/api/ideas/52/case/P-999").status_code == 404


def test_explain_falls_back_per_language_and_reading_level(client):
    dutch = client.post("/api/ideas/52/explain", json={"patient_id": "P-010", "language": "nl"}).json()
    italian = client.post(
        "/api/ideas/52/explain",
        json={"patient_id": "P-010", "language": "it", "reading_level": "detailed"},
    ).json()

    assert dutch["mode"] == "fallback"
    assert dutch["reading_level"] == "simple"
    assert italian["language_label"].startswith("Italiano")
    assert dutch["patient_sentences"][0]["text"] != italian["patient_sentences"][0]["text"]
    # Every sentence links to a source document that exists in the case.
    for sentence in dutch["patient_sentences"] + dutch["gp_sentences"]:
        assert sentence["source_title"] != "Source not linked"
    assert len(dutch["questions"]) == 3
    # The GP letter is the same German letter whichever language the patient reads.
    assert dutch["gp_sentences"][0]["text"] == italian["gp_sentences"][0]["text"]
