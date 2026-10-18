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
    assert len(body["blocks"][0]["items"]) == 3
    assert body["blocks"][0]["items"][2]["label"] == "No treatment / Do nothing"
    assert "follow-up" in body["blocks"][0]["items"][2]["detail"]


def test_priorities_filter_synthetic_cases_and_reach_explanation(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)
    survival = {"quality": 1, "survivalFit": 10, "mobility": 1}
    context = consultation_data(Consultation(priorities=survival))
    assert context["priorities"] == survival
    assert {item["priority"] for item in context["comparable_patients"]} == {"survivalFit"}
    assert all(63 <= item["age"] <= 73 and item["stage"] == "III" for item in context["comparable_patients"])
    assert consultation_data(Consultation(horizon="six-months", priorities=survival))["comparable_patients"] == []
    assert (
        consultation_data(Consultation(priorities={"quality": 0, "survivalFit": 0, "mobility": 0}))[
            "comparable_patients"
        ]
        == []
    )
    tied = consultation_data(Consultation(priorities={"quality": 10, "survivalFit": 1, "mobility": 10}))
    assert {item["priority"] for item in tied["comparable_patients"]} == {"quality", "mobility"}
    response = client.post("/api/ideas/104/explain", json={"priorities": survival})
    assert response.status_code == 200
    assert "Reduce the chance of cancer returning 10" in response.json()["blocks"][0]["body"]
    assert "No model connected" in str(response.json())
    assert client.post("/api/ideas/104/explain", json={"priorities": {"quality": 11}}).status_code == 422


@pytest.mark.parametrize("case_id", ["neuropathy", "hair-loss", "nausea"])
def test_case_specific_priorities_and_fallback(case_id, monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    context = consultation_data(Consultation(case_id=case_id))
    assert context["priority_case"]["id"] == case_id
    assert "colon cancer" in context["priority_case"]["context"]
    assert "treatment-related fatigue" in context["priority_case"]["labels"]["quality"]
    if case_id != "neuropathy":
        assert context["comparable_patients"] == []
        assert context["priority_case"]["scores"][0]["mobility"] == context["priority_case"]["scores"][1]["mobility"]
    assert context["priority_case"]["context"] in context["patient"]
    assert len(context["priority_case"]["scores"]) == len(context["options"])
    client = TestClient(app)
    result = client.post("/api/ideas/104/explain", json={"case_id": case_id}).json()
    assert result["mode"] == "fallback"
    assert context["priority_case"]["labels"]["mobility"] in result["blocks"][0]["body"]
    assert context["side_effect_reference"]["url"] in str(result)
    assert "not a source for invented risks" in str(result)
    assert {effect["name"] for effect in context["side_effects"]} >= {"Hair loss", "Neuropathy"}
    assert client.post("/api/ideas/104/explain", json={"case_id": "unknown"}).status_code == 422


def test_side_effect_preferences_and_comparable_characteristics(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    context = consultation_data(Consultation(avoided_effects=["hairLoss", "nausea"]))
    assert context["avoided_effects"] == ["hairLoss", "nausea"]
    assert context["patient_characteristics"]["ECOG"] == "1"
    assert all("characteristics" in item for item in context["comparable_patients"])
    assert any(item["characteristics"]["Sex"] != "Female" for item in context["comparable_patients"])
    assert context["options"][0]["trajectories"]["hairLoss"] == [2, 3, 1]
    assert context["options"][2]["trajectories"]["nausea"] == [0, 0, 0]
    for option in context["options"]:
        for values in option["trajectories"].values():
            assert len(values) == 3
    minimal = consultation_data(Consultation(horizon="six-months"))
    assert minimal["patient_characteristics"] == {}
    assert all(option["trajectories"] == {} for option in minimal["options"])
    client = TestClient(app)
    response = client.post("/api/ideas/104/explain", json={"avoided_effects": ["hairLoss", "nausea"]})
    assert response.status_code == 200
    assert "Additional avoidance concerns: Hair loss, Nausea and vomiting" in response.json()["blocks"][0]["body"]
    assert client.post("/api/ideas/104/explain", json={"avoided_effects": ["unknown"]}).status_code == 422


@pytest.mark.parametrize(
    ("patient_id", "name", "age", "case_id", "ecog"),
    [
        ("SDM-104", "Eva Sommer", 68, "neuropathy", "1"),
        ("SDM-104-2", "Marta Klein", 61, "hair-loss", "0"),
        ("SDM-104-3", "Leon Fischer", 72, "nausea", "1"),
    ],
)
def test_distinct_fixed_patient_records(patient_id, name, age, case_id, ecog, monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    original = sample_data.read("issue-104.json")
    context = consultation_data(Consultation(patient_id=patient_id))
    assert context["patient_identity"]["id"] == patient_id
    assert context["patient_identity"]["name"] == name
    assert context["patient_identity"]["age"] == age
    assert context["patient_characteristics"]["ECOG"] == ecog
    assert context["priority_case"]["id"] == case_id
    assert consultation_data(Consultation(case_id=case_id)) == context
    if patient_id != "SDM-104":
        assert "Eva" not in context["patient"]
        assert context["comparable_patients"] == []
    assert (
        consultation_data(Consultation(patient_id=patient_id, priorities={"quality": 10}))["patient_identity"]
        == context["patient_identity"]
    )
    assert sample_data.read("issue-104.json") == original
    client = TestClient(app)
    result = client.post("/api/ideas/104/explain", json={"patient_id": patient_id}).json()
    assert f"Patient: {name} ({patient_id})" in result["blocks"][0]["body"]
    assert client.post("/api/ideas/104/explain", json={"patient_id": "unknown"}).status_code == 422


def test_free_text_priorities_are_discussion_context_only(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    text = "  I want energy for my daughter's graduation.  "
    baseline = consultation_data(Consultation(patient_id="SDM-104-2"))
    context = consultation_data(Consultation(patient_id="SDM-104-2", personal_priorities=text))
    assert context["personal_priorities"] == text.strip()
    assert context["options"] == baseline["options"]
    assert context["priorities"] == baseline["priorities"]
    assert context["patient_identity"] == baseline["patient_identity"]
    assert context["comparable_patients"] == baseline["comparable_patients"]
    client = TestClient(app)
    result = client.post("/api/ideas/104/explain", json={"patient_id": "SDM-104-2", "personal_priorities": text}).json()
    assert text.strip() in result["blocks"][0]["body"]
    assert "discussion context only, not scored" in result["blocks"][0]["body"]
    assert client.post("/api/ideas/104/explain", json={"personal_priorities": "x" * 1001}).status_code == 422
