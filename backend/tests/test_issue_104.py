import pytest
from fastapi.testclient import TestClient

from app import sample_data
from app.config import settings
from app.ideas.issue_104 import Consultation, consultation_data
from app.main import app


@pytest.mark.parametrize("country", ["Germany", "Italy", "Netherlands"])
def test_shared_decision_demo(country, monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)
    response = client.post("/api/ideas/104/explain", json={"country": country, "horizon": "six-months"})
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "fallback"
    assert {block["type"] for block in body["blocks"]} == {"summary", "evidence"}
    assert "synthetic" in body["blocks"][1]["body"]
    source = consultation_data(Consultation(country=country))["country"]["source"]
    assert body["blocks"][1]["items"][0]["label"] == source
    assert "ECOG" not in consultation_data(Consultation(horizon="six-months"))["patient"]
    assert "ECOG" in consultation_data(Consultation(horizon="future"))["patient"]
    assert client.post("/api/ideas/104/explain", json={"country": "Unknown"}).status_code == 422
    dataset = sample_data.read("minimal-mdt-dataset.json")
    fields = {element["name"] for group in dataset["groups"] for element in group["elements"]}
    assert set(sample_data.read("issue-104.json")["coverage"]) <= fields
