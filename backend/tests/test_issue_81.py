from fastapi.testclient import TestClient

from app.config import settings
from app.ideas import routers
from app.main import app


def test_issue_81_review_and_conditional_routes(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    assert any(router.prefix == "/api/ideas/81" for router in routers())
    with TestClient(app) as client:
        response = client.get("/api/ideas/81/case")
        assert response.status_code == 200
        case = response.json()
        assert case["patient"]["id"] == "C-081"
        assert case["patient"]["name"] == "Elena Fischer"
        assert case["patient"]["allergies"] == "Penicillin rash"
        assert len(case["sources"]) == 4
        ecog_coverage = next(item for item in case["coverage"] if item["label"] == "ECOG / WHO performance status")
        assert ecog_coverage["likely_source"] == "patient / clinic note"
        assert ecog_coverage["status"] == "partial"
        assert all(source["content"] for source in case["sources"])
        facts = case["facts"]
        assert {fact["key"] for fact in facts} == {"stage", "mmr", "allergy", "wishes", "ecog", "cea"}
        assert all(" · " in fact["source"] for fact in facts)
        initial = client.post("/api/ideas/81/prepare", json={"horizon": "future"}).json()
        assert initial["recommendations"] == []
        assert initial["agent"]["mode"] == "fallback"
        pending = client.post("/api/ideas/81/prepare", json={"horizon": "future", "facts": facts}).json()
        assert len(pending["recommendations"]) == 3
        assert "If localized" in pending["recommendations"][0]["detail"]
        assert "2026-10-08" in str(pending["missing"])
        assert "2026-10-09" in str(pending["missing"])
        assert len(pending["conflicts"]) == 2
        for fact in facts:
            if fact["key"] in {"stage", "mmr"}:
                fact.update(
                    value="localized" if fact["key"] == "stage" else "dMMR",
                    status="available",
                    source="Clinician review · corrected result",
                )
            if fact["key"] == "allergy":
                fact["value"] = "No known allergies"
            if fact["key"] == "wishes":
                fact["value"] = "Values independent living"
        corrected = client.post("/api/ideas/81/prepare", json={"horizon": "future", "facts": facts}).json()
        assert corrected["conflicts"] == []
        assert not any(item["label"] in {"CT staging", "MMR result"} for item in corrected["missing"])
        assert "Reviewed stage: localized" in corrected["recommendations"][0]["detail"]
        assert "Reviewed MMR: dMMR" in corrected["recommendations"][0]["detail"]
        assert "do not infer metastatic disease" in corrected["recommendations"][0]["detail"]
        assert any("mmr: dMMR" in used for used in corrected["recommendations"][0]["used"])
        six = client.post("/api/ideas/81/prepare", json={"horizon": "six-months"}).json()
        assert all(fact["status"] == "missing" for fact in six["facts"] if fact["key"] in {"allergy", "wishes", "ecog"})
        assert any(item["label"] == "Patient wishes" for item in six["missing"])
        omitted = client.post("/api/ideas/81/prepare", json={"horizon": "six-months", "facts": []}).json()
        assert omitted["facts"] == []
        assert all(not item["used"] for item in omitted["recommendations"])
        assert all("Penicillin" not in str(item) for item in omitted["conflicts"])
        facts[0]["value"] = "stage IV assumed"
        assert client.post("/api/ideas/81/prepare", json={"horizon": "future", "facts": facts}).status_code == 422
