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
        assert len(future["excluded_trials"]) == 2
        assert {t["id"] for t in future["excluded_trials"]}.isdisjoint(t["id"] for t in future["trials"])
        assert all(t["counts"]["Conflict"] > 0 for t in future["excluded_trials"])
        candidate = future["trials"][0]
        assert candidate["counts"] == {"Match": 8, "Conflict": 0, "Unknown": 1}
        assert candidate["criteria"][6]["status"] == "Unknown"
        assert candidate["criteria"][0]["patient_label"] == "Age"
        assert candidate["criteria"][0]["patient_value"] == "58 years"
        assert candidate["criteria"][6]["patient_value"] == "No current eGFR recorded"
        assert all(c["source"] and c["protocol_source"] for c in candidate["criteria"])
        assert all(t["counts"]["Conflict"] == 0 for t in future["trials"])
        assert future["trials"][1]["id"] == "LOCAL-078-E"
        assert all(t["patient_pack"] and t["enquiry_note"] for t in future["trials"])
        assert all(
            t["treatment"] and t["design"] and t["arms"] and t["practical_meaning"]
            for t in future["trials"] + future["excluded_trials"]
        )
        assert all("synthetic" in e["source"].lower() for t in future["trials"] for e in t["evidence_track"])

        six_month = client.get("/api/ideas/78/context?horizon=six-month").json()
        assert len(six_month["trials"]) == 2
        assert six_month["trials"][0]["counts"]["Unknown"] == 2
        assert six_month["facts"]["ecog"]["value"] is None
        ecog = next(c for c in six_month["trials"][0]["criteria"] if c["field"] == "ecog")
        assert ecog["patient_value"] == "Not structured in the six-month dataset"
        assert ecog["status"] == "Unknown"
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


def test_site_metadata_and_pseudonymised_email(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    with TestClient(app) as client:
        assessment = client.get("/api/ideas/78/context").json()
        assert "stays in the hospital" in assessment["data_principles"]
        for trial in assessment["trials"] + assessment["excluded_trials"]:
            assert trial["registry_id"].startswith("SYNTHETIC-")
            nearest = [centre for centre in trial["centres"] if centre["nearest"]]
            assert len(nearest) == 1
            assert nearest[0]["distance_km"] == min(c["distance_km"] for c in trial["centres"])
            assert trial["site_contact"]["email"].endswith(".invalid")
        response = client.post("/api/ideas/78/handoff", json={"trial_id": "LOCAL-078-A"})
        assert response.status_code == 200
        email = response.json()
        assert email["mode"] == "fallback"
        assert email["simulation"] and email["channel"] == "email"
        assert "REF-078" in email["body"] and "eGFR" in email["body"]
        assert "Eligibility is not confirmed" in email["body"]
        assert not any(
            value in email["body"] for value in ("Eva", "Sommer", "TM-078", "58", "female", "LAB-078", "2026-09-28")
        )
        assert "onboarding" in email["body"]
        assert client.post("/api/ideas/78/handoff", json={"trial_id": "LOCAL-078-B"}).status_code == 422
        assert (
            client.post("/api/ideas/78/handoff", json={"horizon": "six-month", "trial_id": "NETWORK-078-D"}).status_code
            == 422
        )


def test_email_sdk_receives_only_minimal_details_and_rejects_identity(monkeypatch):
    import asyncio

    from app.agent.models import AgentResult
    from app.agent.ui import UIBlock
    from app.ideas import issue_78

    async def draft_email(request, **kwargs):
        assert request.patient_id == "REF-078"
        assert kwargs["data_tools"] == []
        assert not any(
            value in kwargs["prompt"] for value in ("Eva", "Sommer", "TM-078", "58", "female", "LAB-078", "2026-09-28")
        )
        return AgentResult(
            mode="copilot",
            headline="Draft",
            blocks=[UIBlock(type="actions", title="Participation email", body="Referral REF-078: Eva Sommer")],
        )

    monkeypatch.setattr(issue_78, "run_agent", draft_email)
    email = asyncio.run(issue_78.handoff(issue_78.HandoffRequest(trial_id="LOCAL-078-A")))
    assert email["mode"] == "fallback"
    assert "pseudonymisation" in email["note"]
    assert "Sommer" not in email["body"]


def test_email_timeout_retains_demo_draft(monkeypatch):
    import asyncio

    from app.ideas import issue_78

    async def unavailable(request, **kwargs):
        raise TimeoutError

    monkeypatch.setattr(issue_78, "run_agent", unavailable)
    email = asyncio.run(issue_78.handoff(issue_78.HandoffRequest(trial_id="LOCAL-078-E")))
    assert email["mode"] == "fallback"
    assert "timed out" in email["note"]
    assert "REF-078" in email["body"]


def test_recruitment_evidence_and_referral_metadata(monkeypatch):
    from app.ideas.issue_78 import DATA, screening

    assessment = screening("future")
    assert "second-line" in assessment["patient"]["treatment_line"]
    assert "FOLFOX" in assessment["patient"]["prior_systemic_treatment"]
    for trial in assessment["trials"] + assessment["excluded_trials"]:
        assert trial["status"] == "Recruiting"
        assert trial["schedule"] and trial["drug_class"] and trial["screening_examinations"]
        assert {e["phase"] for e in trial["evidence_track"]} >= {"I", "III"}
        assert all("synthetic" in e["source"].lower() and e["result"] for e in trial["evidence_track"])
        assert any("subgroup" in e["result"] or "/" in e["result"] for e in trial["evidence_track"])
        assert trial["illustrative_profile"]["benefit"] in {"high", "moderate", "limited", "unknown"}
        assert trial["illustrative_profile"]["toxicity"] in {"high", "moderate", "limited", "unknown"}
        assert "Synthetic" in trial["illustrative_profile"]["source"]
        assert any(exam["study_specific"] for exam in trial["screening_examinations"])
    partner = next(t for t in assessment["trials"] if t["scope"] == "network")
    agreement = partner["referral_agreement"]
    assert not agreement["exists"] and agreement["source"]
    assert "institutional referral agreement" in agreement["agreement_email"]["body"]
    assert "REF-078" in agreement["referral_letter"]
    assert "Eva" not in agreement["referral_letter"]
    data = sample_data.read(DATA)
    data["trials"][0]["status"] = "Closed"
    data["trials"][1]["status"] = "Not yet recruiting"
    original_read = sample_data.read
    monkeypatch.setattr(sample_data, "read", lambda path: data if path == DATA else original_read(path))
    result = screening("future")
    assert all(t["id"] not in {"LOCAL-078-A", "LOCAL-078-B"} for t in result["trials"] + result["excluded_trials"])


def test_treatment_naive_or_unknown_history_never_supports_prior_regimen(monkeypatch):
    from app.ideas.issue_78 import DATA, screening

    data = sample_data.read(DATA)
    original_read = sample_data.read
    monkeypatch.setattr(sample_data, "read", lambda path: data if path == DATA else original_read(path))
    for value in ("", "none", "no prior systemic therapy"):
        data["facts"]["therapy"].update(value=value, display="no prior systemic therapy")
        for horizon in ("future", "six-month"):
            result = screening(horizon)
            assert result["patient"]["prior_systemic_treatment"] == "no prior systemic therapy"
            assert result["patient"]["treatment_line"] == "First-line consideration"
            assert all(t["id"] not in {"LOCAL-078-A", "LOCAL-078-E"} for t in result["trials"])
            for trial in result["excluded_trials"]:
                for criterion in trial["criteria"]:
                    if criterion["field"] == "therapy":
                        assert criterion["status"] == "Conflict"
    data["facts"]["therapy"].update(value=None, display="Not recorded")
    result = screening("future")
    assert "not recorded" in result["patient"]["prior_systemic_treatment"]
    assert "not recorded" in result["patient"]["treatment_line"]
    assert all(c["status"] == "Unknown" for t in result["trials"] for c in t["criteria"] if c["field"] == "therapy")
