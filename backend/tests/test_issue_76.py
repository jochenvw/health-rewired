import pytest
from fastapi.testclient import TestClient

from app import sample_data
from app.agent import AgentResult
from app.agent.ui import UIBlock
from app.config import settings
from app.ideas import issue_76
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    return TestClient(app)


def _extract(client, patient_id="COL-001", horizon="future"):
    response = client.post("/api/ideas/76/extract", json={"patient_id": patient_id, "horizon": horizon})
    assert response.status_code == 200
    return response.json()


def _recommend(client, extracted, **changes):
    return client.post(
        "/api/ideas/76/recommend",
        json={k: extracted[k] for k in ("patient_id", "horizon", "facts")} | {"reviewed": True} | changes,
    )


def test_workspace_coverage_uses_actual_dataset(client):
    workspace = client.get("/api/ideas/76/workspace").json()
    assert len(workspace["patients"]) == 3
    assert {s["id"] for s in workspace["sources"]} == {"dutch", "italian", "nccn"}
    assert all("verified" in s["status"] for s in workspace["sources"])
    names = {e["name"] for g in sample_data.read("minimal-mdt-dataset.json")["groups"] for e in g["elements"]}
    assert workspace["coverage"]["included"] == sum(
        e["dataset_element"] in names for e in workspace["coverage"]["elements"]
    )
    assert next(e for e in workspace["coverage"]["elements"] if e["key"] == "allergy")["availability"] == "unavailable"
    assert all(s["name"] and s["version"] == "Edition and currency not verified" for s in workspace["sources"])


def test_no_token_workflow_and_required_physician_review(client):
    extracted = _extract(client)
    assert extracted["agent"]["mode"] == "fallback"
    assert all(f["source"].startswith("COL-001") for f in extracted["facts"])
    assert _recommend(client, extracted, reviewed=False).status_code == 409
    response = _recommend(client, extracted)
    assert response.status_code == 200
    result = response.json()
    assert result["recommendations"][0]["id"] == "primary-pathway"
    assert "primary surgery" in result["recommendations"][0]["title"]
    assert result["agent"]["mode"] == "fallback"
    assert any("Cefazolin" in conflict for conflict in result["conflicts"])
    assert any("stoma" in conflict for conflict in result["conflicts"])
    assert result["recommendations"][0]["source_ids"] == ["dutch", "italian", "nccn"]


def test_pending_staging_biopsy_and_mmr_are_not_inferred(client):
    extracted = _extract(client, "COL-003")
    result = _recommend(client, extracted).json()
    assert "Complete staging" in result["recommendations"][0]["title"]
    assert {"Distant staging", "Histological diagnosis", "MMR / MSI"} <= {m["field"] for m in result["missing"]}
    assert "staging" not in result["recommendations"][0]["used_facts"]
    assert any(m["status"] == "pending" and "requested result" in m["action"] for m in result["missing"])


def test_postoperative_conflicts_and_correction_change_assessment(client):
    extracted = _extract(client, "COL-002")
    result = _recommend(client, extracted).json()
    assert "postoperative" in result["recommendations"][0]["title"]
    assert "adjuvant systemic" in result["recommendations"][0]["options"][0]
    assert any("Oxaliplatin" in conflict for conflict in result["conflicts"])
    pathology = next(f for f in extracted["facts"] if f["key"] == "ptnm")
    pathology["value"] = "pT2N0, 0/21 nodes"
    mmr = next(f for f in extracted["facts"] if f["key"] == "mmr")
    mmr.update(value="MMR proficient", status="recorded", source="Physician review")
    corrected = _recommend(client, extracted).json()
    assert "surveillance versus" in corrected["recommendations"][0]["options"][0]
    assert "MMR / MSI" not in {m["field"] for m in corrected["missing"]}
    items = next(b["items"] for b in corrected["agent"]["blocks"] if b["title"] == "Reviewed facts used")
    assert any("Physician correction" in i["source"] for i in items)


def test_six_month_drops_unavailable_data_even_if_resubmitted(client):
    extracted = _extract(client, "COL-002", "six-month")
    for fact in extracted["facts"]:
        if fact["key"] in {"allergy", "wishes", "performance"}:
            assert fact["status"] == "unavailable"
            assert "Oxaliplatin" not in fact["value"]
            fact.update(value="No known allergies", status="recorded")
    result = _recommend(client, extracted).json()
    assert {"Drug allergies / prior severe reaction", "Patient wishes and values", "Performance status"} <= {
        m["field"] for m in result["missing"] if m["status"] == "unavailable"
    }
    assert {"allergy", "wishes", "performance"}.isdisjoint(result["recommendations"][0]["used_facts"])
    assert any("do not infer no conflict" in c for c in result["conflicts"])


def test_missing_review_fields_and_unknown_patients(client):
    extracted = _extract(client)
    extracted["facts"] = [f for f in extracted["facts"] if f["key"] != "staging"]
    result = _recommend(client, extracted).json()
    assert any(m["field"] == "Distant staging" and m["status"] == "missing" for m in result["missing"])
    assert client.post("/api/ideas/76/extract", json={"patient_id": "unknown"}).status_code == 404
    assert client.post("/api/ideas/76/extract", json={"patient_id": "COL-001", "horizon": "invalid"}).status_code == 422


def test_sdk_claims_are_bounded_to_supplied_evidence(client, monkeypatch):
    calls = []

    async def fake_run_agent(request, **kwargs):
        calls.append(kwargs)
        return AgentResult(
            mode="copilot",
            headline="Latest verified guidelines",
            blocks=[UIBlock(type="summary", title="Invented guideline", body="Latest guideline says administer X.")],
        )

    monkeypatch.setattr(issue_76, "run_agent", fake_run_agent)
    result = _recommend(client, _extract(client)).json()
    assert len(calls) == 2
    assert calls[0]["extra_tools"][0].name == "review_colon_mdt_context"
    assert result["agent"]["mode"] == "copilot"
    assert "Latest verified guidelines" not in str(result)
    assert "administer X" not in str(result)
    assert all(b["type"] in {"actions", "evidence", "alert"} for b in result["agent"]["blocks"])


def test_corrected_metastatic_stage_does_not_use_localised_pathway(client):
    extracted = _extract(client)
    next(f for f in extracted["facts"] if f["key"] == "ctnm")["value"] = "cT3N0M1"
    result = _recommend(client, extracted).json()
    assert "Complete staging" in result["recommendations"][0]["title"]
    assert "outside this demo" in result["recommendations"][0]["options"][1]
