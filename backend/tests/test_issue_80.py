import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.agent.models import AgentResult
from app.agent.ui import UIBlock
from app.config import settings
from app.ideas import issue_80
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def prepare(client, **changes):
    response = client.post(
        "/api/ideas/80/prepare", json={"horizon": "future", "reviewed": True, "fields": {}, **changes}
    )
    assert response.status_code == 200
    return response.json()


def test_record_and_review_gate(client, monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("SDK must not run before clinician review")

    monkeypatch.setattr(issue_80, "run_agent", forbidden)
    record = client.get("/api/ideas/80/record").json()
    assert record["id"] == "I80-001"
    assert {f["key"] for f in record["fields"]} == {
        "stage",
        "histology",
        "mmr",
        "ct",
        "ecog",
        "comorbidity",
        "allergy",
        "wishes",
    }
    assert {d["format"] for d in record["documents"]} == {"CSV", "Word-style note", "FHIR JSON"}
    csv_doc = next(d for d in record["documents"] if d["format"] == "CSV")
    assert list(csv.DictReader(io.StringIO(csv_doc["body"])))[0]["value"] == "cT3N0Mx"
    fhir_doc = next(d for d in record["documents"] if d["format"] == "FHIR JSON")
    assert json.loads(fhir_doc["body"])["resourceType"] == "AllergyIntolerance"
    body = prepare(client, reviewed=False)
    assert body["recommendations"] == body["missing"] == body["conflicts"] == []
    assert body["agent"]["trace"] == []


def test_pending_results_and_idea_specific_fallback(client):
    body = prepare(client)
    assert body["agent"]["mode"] == "fallback"
    assert {m["label"] for m in body["missing"]} >= {"Clinical stage", "CT staging", "MMR / MSI"}
    assert any("Localized" in r["option"] for r in body["recommendations"])
    assert any("Metastatic" in r["option"] for r in body["recommendations"])
    assert len(body["conflicts"]) == 3
    assert all("fictional" in r["source"] for r in body["recommendations"])
    assert any("8 October" in m["source"] for m in body["missing"])
    assert any("9 October" in m["source"] for m in body["missing"])
    assert any(b["type"] == "evidence" for b in body["agent"]["blocks"])


def test_corrections_select_pathways_and_resolve_conflicts(client):
    corrections = {
        "stage": "cT3N0M0",
        "ct": "No metastases",
        "mmr": "pMMR / MSS",
        "allergy": "No known drug allergies",
        "comorbidity": "No neuropathy",
        "wishes": "No preference stated",
    }
    local = prepare(client, fields=corrections)
    assert len(local["recommendations"]) == 3
    assert all("Localized" in r["option"] for r in local["recommendations"])
    assert len({r["guideline"] for r in local["recommendations"]}) == 3
    assert all("confirm staging" in r["passage"] for r in local["recommendations"])
    assert local["missing"] == local["conflicts"] == []
    stage = next(f for f in local["record"]["fields"] if f["key"] == "stage")
    assert stage["source"] == "Clinician-reviewed correction"
    metastatic = prepare(client, fields={**corrections, "stage": "cT3N0M1", "ct": "Metastases confirmed"})
    assert all("Metastatic" in r["option"] for r in metastatic["recommendations"])
    common_options = [r for r in metastatic["recommendations"] if "non-oxaliplatin" in r["option"]]
    assert len({r["guideline"] for r in common_options}) == 3
    assert not any("MSI-high" in r["option"] for r in metastatic["recommendations"])
    deficient = prepare(
        client,
        fields={
            **corrections,
            "stage": "cT3N0M1",
            "ct": "Metastases confirmed",
            "mmr": "dMMR / MSI-high",
        },
    )
    assert any("MSI-high" in r["option"] for r in deficient["recommendations"])
    unknown = prepare(client, fields={**corrections, "mmr": "Unknown"})
    assert any(m["label"] == "MMR / MSI" for m in unknown["missing"])
    unfit = prepare(client, fields={**corrections, "ecog": "ECOG 3"})
    assert "On hold" in unfit["recommendations"][0]["status"]
    other_histology = prepare(client, fields={**corrections, "histology": "Lymphoma"})
    assert "On hold" in other_histology["recommendations"][0]["status"]
    for histology in ("Not adenocarcinoma; lymphoma", "Adenocarcinoma unconfirmed", "No evidence of adenocarcinoma"):
        unconfirmed = prepare(client, fields={**corrections, "histology": histology})
        assert all("On hold" in r["status"] for r in unconfirmed["recommendations"])
    contradictory = prepare(client, fields={**corrections, "stage": "cT3N0M1"})
    assert any(c["option"] == "Staging pathway" for c in contradictory["conflicts"])
    ambiguous = prepare(client, fields={**corrections, "ct": "Report unavailable", "mmr": "MMR negative"})
    assert any(m["label"] == "MMR / MSI" for m in ambiguous["missing"])
    assert any("Metastatic" in r["option"] for r in ambiguous["recommendations"])
    neuropathy = prepare(client, fields={**corrections, "comorbidity": "No diabetes; persistent neuropathy"})
    assert any("neuropathy" in c["reason"] for c in neuropathy["conflicts"])
    allergy = prepare(
        client,
        fields={
            **corrections,
            "allergy": "No penicillin allergy; oxaliplatin hypersensitivity",
        },
    )
    assert any("hypersensitivity" in c["reason"] for c in allergy["conflicts"])
    allergy = prepare(
        client,
        fields={
            **corrections,
            "allergy": "No allergies to penicillin; oxaliplatin hypersensitivity",
        },
    )
    assert any("hypersensitivity" in c["reason"] for c in allergy["conflicts"])
    negative_allergy = prepare(client, fields={**corrections, "allergy": "No oxaliplatin hypersensitivity"})
    assert negative_allergy["conflicts"] == []


def test_six_month_masking_also_masks_documents_and_submitted_overrides(client, monkeypatch):
    captured = {}

    async def fake_agent(request, **kwargs):
        captured.update(kwargs)
        return AgentResult(mode="fallback", headline="unused", blocks=[], note="SDK unavailable")

    monkeypatch.setattr(issue_80, "run_agent", fake_agent)
    body = prepare(client, horizon="six-months", fields={"allergy": "SECRET-ALLERGY", "wishes": "SECRET-WISH"})
    assert {f["key"] for f in body["record"]["fields"]} == {"stage", "histology", "mmr", "ct", "ecog", "comorbidity"}
    text = json.dumps(body)
    assert "SECRET-" not in text
    assert "piano" not in text and "hypersensitivity during" not in text
    assert "SECRET-" not in captured["prompt"]
    assert captured["include_data_tools"] is False
    assert len(captured["extra_tools"]) == 3
    assert len(body["conflicts"]) == 1  # neuropathy remains; do not reconstruct excluded facts
    assert any("Outside minimal" in m["status"] for m in body["missing"])
    assert any(m["label"] == "ECOG / WHO performance status" for m in body["missing"])
    ecog = next(f for f in body["record"]["fields"] if f["key"] == "ecog")
    assert ecog["likely_source"] == "patient / clinic note"
    assert "Unavailable" in ecog["value"]
    ecog_gap = next(m for m in body["missing"] if m["label"] == ecog["label"])
    assert any("Performance" in branch for branch in ecog_gap["branches"])
    assert all("metastatic" not in branch.lower() for branch in ecog_gap["branches"])
    assert body["record"]["documents"][0]["format"] == "CSV"
    rows = list(csv.DictReader(io.StringIO(body["record"]["documents"][0]["body"])))
    assert {row["key"] for row in rows} == {f["key"] for f in body["record"]["fields"]}
    assert all(row["source"] for row in rows)
    assert all("allergy:" not in " ".join(r["used"]) for r in body["recommendations"])
    local_review = prepare(client, horizon="six-months", fields={"ecog": "ECOG 1"})
    assert not any(m["label"] == "ECOG / WHO performance status" for m in local_review["missing"])


def test_sdk_result_and_read_only_tools_used(client, monkeypatch):
    async def fake_agent(request, **kwargs):
        assert kwargs["include_data_tools"] is False
        tools = kwargs["extra_tools"]
        assert {t.name for t in tools} == {
            "issue80_reviewed_facts",
            "issue80_retrieve_excerpt",
            "issue80_match_reviewed",
        }
        assert "render_ui" in kwargs["system_prompt"]
        assert "reviewed" in kwargs["prompt"]
        return AgentResult(
            mode="copilot", headline="Reviewed synthetic options", blocks=[UIBlock(type="summary", title="Fictional")]
        )

    monkeypatch.setattr(issue_80, "run_agent", fake_agent)
    assert prepare(client)["agent"]["mode"] == "copilot"
