import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def test_twin_simulation_for_maria_lopez(client):
    body = client.get("/api/ideas/36/twin/P-004").json()
    assert body["patient_id"] == "P-004"
    path_ids = {p["id"] for p in body["paths"]}
    assert path_ids == {"platinum_doublet_chemo", "continue_osimertinib_plus_sbrt", "clinical_trial_SYN_LU_310"}
    for path in body["paths"]:
        assert len(path["trajectory"]) == 4
        assert path["assumptions"]
        assert path["evidence"]
        assert any(point["note"] for point in path["trajectory"])
    assert "biopsy" in body["informative_test"].lower()
    assert body["what_if"] == {"biopsy_result": "unknown", "priority": "balanced"}


def test_twin_what_if_biopsy_result_shifts_trajectories(client):
    baseline = client.get("/api/ideas/36/twin/P-004").json()
    met = client.get("/api/ideas/36/twin/P-004", params={"biopsy_result": "met_amplification"}).json()

    def by_id(body, path_id):
        return next(p for p in body["paths"] if p["id"] == path_id)

    baseline_continue = by_id(baseline, "continue_osimertinib_plus_sbrt")["trajectory"][-1]["progression_risk_pct"]
    met_continue = by_id(met, "continue_osimertinib_plus_sbrt")["trajectory"][-1]["progression_risk_pct"]
    assert met_continue > baseline_continue
    assert met["what_if"]["biopsy_result"] == "met_amplification"
    assert "MET amplification" in met["what_if_explanation"]
    # Chemotherapy does not depend on the resistance mechanism.
    assert by_id(baseline, "platinum_doublet_chemo")["trajectory"] == by_id(met, "platinum_doublet_chemo")["trajectory"]


def test_twin_what_if_priority_changes_chemo_toxicity(client):
    balanced = client.get("/api/ideas/36/twin/P-004").json()
    gentle = client.get("/api/ideas/36/twin/P-004", params={"priority": "minimize_toxicity"}).json()

    def chemo_toxicity(body):
        path = next(p for p in body["paths"] if p["id"] == "platinum_doublet_chemo")
        return max(point["toxicity_grade"] for point in path["trajectory"])

    assert chemo_toxicity(gentle) < chemo_toxicity(balanced)
    assert gentle["what_if"]["priority"] == "minimize_toxicity"


def test_twin_simulation_unknown_patient_returns_404(client):
    response = client.get("/api/ideas/36/twin/P-999")
    assert response.status_code == 404


def test_twin_simulation_falls_back_generically_for_other_patients(client):
    body = client.get("/api/ideas/36/twin/P-001").json()
    assert body["patient_id"] == "P-001"
    assert len(body["paths"]) == 3


def test_ask_falls_back_without_token_and_uses_comparable_patients_tool(client):
    response = client.post("/api/ideas/36/ask", json={"task": "Compare the paths for Maria", "patient_id": "P-004"})
    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "fallback"
