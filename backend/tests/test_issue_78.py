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
        assert len(future["trials"]) == 3
        assert future["excluded_count"] == 2
        candidate = future["trials"][0]
        assert candidate["counts"] == {"Match": 8, "Conflict": 0, "Unknown": 1}
        assert candidate["criteria"][6]["status"] == "Unknown"
        assert all(c["source"] and c["protocol_source"] for c in candidate["criteria"])
        assert all(t["counts"]["Conflict"] == 0 for t in future["trials"])
        assert future["trials"][1]["id"] == "LOCAL-078-E"
        assert all(t["patient_pack"] and t["enquiry_note"] for t in future["trials"])
        assert all("synthetic" in e["source"].lower() for t in future["trials"] for e in t["evidence_track"])

        six_month = client.get("/api/ideas/78/context?horizon=six-month").json()
        assert len(six_month["trials"]) == 2
        assert six_month["trials"][0]["counts"]["Unknown"] == 2
        assert six_month["facts"]["ecog"]["value"] is None
        assert all(c["likely_source"] != "Not in dataset" for c in six_month["coverage"])
        assert client.get("/api/ideas/78/context?horizon=invalid").status_code == 422

        review = client.post("/api/ideas/78/review", json={"horizon": "six-month"})
        assert review.status_code == 200
        result = review.json()
        assert result["mode"] == "fallback"
        assert result["note"]
        assert len(result["blocks"][0]["items"]) == 9
        assert sum(item["label"].startswith("Unknown") for item in result["blocks"][0]["items"]) == 2
        assert "Not confirmed eligibility" in result["blocks"][0]["body"]
        assert "LOCAL-078-A" in result["enquiry_notes"]
        assert "ECOG" in result["enquiry_notes"]["LOCAL-078-A"]
        assert any("No tests ordered" in (block["body"] or "") for block in result["blocks"])
        selected = client.post("/api/ideas/78/review", json={"trial_ids": ["LOCAL-078-E"]}).json()
        assert set(selected["enquiry_notes"]) == {"LOCAL-078-E"}
        assert client.post("/api/ideas/78/review", json={"trial_ids": ["LOCAL-078-B"]}).status_code == 422
        assert client.post("/api/ideas/78/review", json={"trial_ids": ["invalid"] * 5}).status_code == 422


def test_old_results_and_positive_exclusion_are_not_matches(monkeypatch):
    from app.ideas.issue_78 import DATA, screening

    data = sample_data.read(DATA)
    data["facts"]["anc"]["date"] = "2026-08-01"
    data["facts"]["autoimmune"]["value"] = True
    original_read = sample_data.read
    monkeypatch.setattr(sample_data, "read", lambda path: data if path == DATA else original_read(path))
    result = screening("future")
    assert result["trials"][0]["criteria"][5]["status"] == "Unknown"
    assert all(t["id"] != "LOCAL-078-B" for t in result["trials"])


def test_age_and_renal_conflicts_hide_candidates(monkeypatch):
    from app.ideas.issue_78 import DATA, screening

    data = sample_data.read(DATA)
    data["facts"]["age"]["value"] = 75
    original_read = sample_data.read
    monkeypatch.setattr(sample_data, "read", lambda path: data if path == DATA else original_read(path))
    result = screening("future")
    assert all(t["id"] != "LOCAL-078-A" for t in result["trials"])
    data["facts"]["age"]["value"] = 58
    data["facts"]["renal"].update(value=45, date="2026-10-02")
    assert screening("future")["trials"] == []
    data["facts"]["renal"].update(value=80, date="2026-08-01")
    assert all(t["counts"]["Unknown"] for t in screening("future")["trials"])


def test_review_timeout_returns_editable_demo_draft(monkeypatch):
    import asyncio

    from app.ideas import issue_78

    async def unavailable(request, **kwargs):
        raise TimeoutError

    monkeypatch.setattr(issue_78, "run_agent", unavailable)
    result = asyncio.run(issue_78.review(issue_78.ScreeningRequest(trial_ids=["LOCAL-078-A"])))
    assert result["mode"] == "fallback"
    assert "timed out" in result["note"]
    assert "eGFR" in result["enquiry_notes"]["LOCAL-078-A"]
