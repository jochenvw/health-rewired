import pytest
from fastapi.testclient import TestClient

from app import sample_data
from app.config import settings
from app.ideas.issue_50 import DOCUMENTS, FIELDS
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_case_returns_four_languages_and_the_minimal_dataset(client):
    body = client.get("/api/ideas/50/case").json()
    assert body["patient"]["id"] == "HR-2041"
    assert {doc["language"] for doc in body["documents"]} == {"Dutch", "French", "Italian", "German"}
    assert all(doc["text"] for doc in body["documents"])
    statuses = {field["status"] for field in body["fields"]}
    assert {"conflict", "implied", "missing", "ok"} == statuses


def test_every_evidence_quote_exists_in_its_source_document():
    texts = {doc["id"]: sample_data.read_text(doc["path"]) for doc in DOCUMENTS}
    for field in FIELDS:
        for item in field["evidence"]:
            assert item["quote"] in texts[item["document"]], f"{field['id']} quote not found in source"


def test_review_falls_back_to_the_demo_summary_without_a_token(client):
    body = client.post("/api/ideas/50/review").json()
    assert body["mode"] == "fallback"
    types = {block["type"] for block in body["blocks"]}
    assert {"alert", "evidence"} <= types
