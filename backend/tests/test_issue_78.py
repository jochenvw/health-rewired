from fastapi.testclient import TestClient

from app import sample_data
from app.config import settings
from app.main import app


def test_trial_screening_and_demo_review(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    with TestClient(app) as client:
        response = client.get("/api/ideas/78/context")
        assert response.status_code == 200
        future = response.json()
        assert len(future["trials"]) == 4
        candidate = future["trials"][0]
        assert candidate["counts"] == {"Match": 7, "Conflict": 0, "Unknown": 1}
        assert candidate["criteria"][6]["status"] == "Unknown"
        assert all(c["source"] and c["protocol_source"] for c in candidate["criteria"])
        immune = future["trials"][1]
        assert immune["counts"] == {"Match": 0, "Conflict": 1, "Unknown": 1}

        six_month = client.get("/api/ideas/78/context?horizon=six-month").json()
        assert len(six_month["trials"]) == 3
        assert six_month["trials"][0]["counts"]["Unknown"] == 2
        assert six_month["facts"]["ecog"]["value"] is None
        assert all(c["likely_source"] != "Not in dataset" for c in six_month["coverage"])
        assert client.get("/api/ideas/78/context?horizon=invalid").status_code == 422

        review = client.post("/api/ideas/78/review", json={"horizon": "six-month"})
        assert review.status_code == 200
        result = review.json()
        assert result["mode"] == "fallback"
        assert result["note"]
        assert len(result["blocks"][0]["items"]) == 8
        assert sum(item["label"].startswith("Unknown") for item in result["blocks"][0]["items"]) == 2
        assert "Not confirmed eligibility" in result["blocks"][0]["body"]
        assert len(result["blocks"]) == 4
        assert "No tests ordered" in result["blocks"][-1]["body"]


def test_old_results_and_positive_exclusion_are_not_matches(monkeypatch):
    from app.ideas.issue_78 import DATA, screening

    data = sample_data.read(DATA)
    data["facts"]["anc"]["date"] = "2026-08-01"
    data["facts"]["autoimmune"]["value"] = True
    original_read = sample_data.read
    monkeypatch.setattr(sample_data, "read", lambda path: data if path == DATA else original_read(path))
    result = screening("future")
    assert result["trials"][0]["criteria"][5]["status"] == "Unknown"
    assert result["trials"][1]["criteria"][1]["status"] == "Conflict"
