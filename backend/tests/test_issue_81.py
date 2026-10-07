import json
from copy import deepcopy

from fastapi.testclient import TestClient

from app.config import settings
from app.ideas import issue_81, routers
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
        allergy_fact = next(fact for fact in facts if fact["key"] == "allergy")
        for allergy_value, expected_warning in [
            ("No known allergies", False),
            ("No penicillin allergy", False),
            ("Penicillin rash; no other known allergies", True),
            ("No penicillin allergy; penicillin rash documented elsewhere", True),
        ]:
            allergy_fact["value"] = allergy_value
            reviewed = client.post("/api/ideas/81/prepare", json={"horizon": "future", "facts": facts}).json()
            assert (
                any(item["label"] == "Allergy and perioperative planning" for item in reviewed["conflicts"])
                is expected_warning
            )
        six = client.post("/api/ideas/81/prepare", json={"horizon": "six-months"}).json()
        assert all(fact["status"] == "missing" for fact in six["facts"] if fact["key"] in {"allergy", "wishes", "ecog"})
        assert any(item["label"] == "Patient wishes" for item in six["missing"])
        omitted = client.post("/api/ideas/81/prepare", json={"horizon": "six-months", "facts": []}).json()
        assert omitted["facts"] == []
        assert all(not item["used"] for item in omitted["recommendations"])
        assert all("Penicillin" not in str(item) for item in omitted["conflicts"])
        facts[0]["value"] = "stage IV assumed"
        assert client.post("/api/ideas/81/prepare", json={"horizon": "future", "facts": facts}).status_code == 422


def test_issue_81_discussion_contract_and_hypothetical_eligibility(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    with TestClient(app) as client:
        for body in [{"horizon": "future"}, {"horizon": "future", "facts": None}]:
            assert client.post("/api/ideas/81/discuss", json=body).status_code == 422
        facts = client.get("/api/ideas/81/case").json()["facts"]
        response = client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts})
        assert response.status_code == 200
        pending = response.json()
        assert set(pending) == {"limitation", "eligibility", "context", "options", "glossary", "evidence", "agent"}
        assert "Staging pending" in pending["eligibility"]
        assert "MMR pending" in pending["eligibility"]
        assert "Surgical pathology" in pending["eligibility"]
        assert "not selectable as prescribed treatment" in pending["eligibility"]
        assert [option["id"] for option in pending["options"]] == ["surgery", "combined"]
        for option in pending["options"]:
            assert set(option) == {
                "id",
                "title",
                "condition",
                "plain_language",
                "metrics",
                "neuropathy",
                "trajectory",
                "reasoning",
            }
            assert set(option["metrics"]) == {"survival", "quality", "mobility", "limitations", "costs"}
            assert all(0 <= value <= 100 for value in option["metrics"].values())
            assert 0 <= option["neuropathy"] <= 100
            assert [point["week"] for point in option["trajectory"]] == list(range(1, 7))
            assert all(0 <= point["fatigue"] <= 100 and point["visits"] >= 0 for point in option["trajectory"])
            assert "arbitrary" in option["reasoning"].lower()
        assert {item["term"] for item in pending["glossary"]} == {"resection", "adjuvant therapy", "MMR / MSI"}
        assert all(set(item) == {"term", "meaning", "timeline", "reference"} for item in pending["glossary"])
        assert all(
            item["reference"].startswith("https://") and " " not in item["reference"] for item in pending["glossary"]
        )
        assert pending["agent"]["mode"] == "fallback"
        assert {block["type"] for block in pending["agent"]["blocks"]} == {"summary", "alert", "evidence"}
        assert "not personal clinical probabilities" in pending["limitation"]
        assert "Personal five-year survival and risk-reduction estimates are unavailable" in pending["limitation"]
        assert "not real treatment effects" in str(pending["options"])
        assert "no URL supports the demo numbers" in str(pending["evidence"])
        assert "not euros" in str(pending["evidence"]).lower()
        assert "Not recorded" in next(item["detail"] for item in pending["context"] if item["label"] == "Comorbidities")
        for fact in facts:
            if fact["key"] in {"stage", "mmr"}:
                fact.update(value="localized" if fact["key"] == "stage" else "pMMR", status="available")
        localized = client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts}).json()
        assert "Reviewed staging is localized" in localized["eligibility"]
        assert "Reviewed tumour MMR: pMMR" in localized["eligibility"]
        assert "ONLY IF pathology/MDT indicate" in localized["eligibility"]
        assert localized["options"] == pending["options"]
        next(fact for fact in facts if fact["key"] == "stage")["value"] = "metastatic"
        metastatic = client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts}).json()
        assert metastatic["options"] == []
        assert "not applicable" in metastatic["eligibility"]
        assert "specialist MDT" in metastatic["eligibility"]
        assert "not applicable" in metastatic["agent"]["blocks"][0]["body"]
        invalid = deepcopy(facts)
        next(fact for fact in invalid if fact["key"] == "ecog")["value"] = "5"
        assert client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": invalid}).status_code == 422
        assert (
            client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts + [facts[0]]}).status_code
            == 422
        )


def test_issue_81_discussion_ecog_recipe_and_no_refill(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    grounded_calls = []
    original_runner = issue_81.run_agent

    async def capture_grounding(request, **kwargs):
        grounded_calls.append(kwargs)
        return await original_runner(request, **kwargs)

    monkeypatch.setattr(issue_81, "run_agent", capture_grounding)
    with TestClient(app) as client:
        facts = client.get("/api/ideas/81/case").json()["facts"]
        base = client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts}).json()
        assert base["options"][0]["metrics"] == {
            "survival": 70,
            "quality": 85,
            "mobility": 90,
            "limitations": 25,
            "costs": 35,
        }
        assert base["options"][1]["metrics"] == {
            "survival": 78,
            "quality": 65,
            "mobility": 70,
            "limitations": 55,
            "costs": 70,
        }
        next(fact for fact in facts if fact["key"] == "ecog")["value"] = "2"
        changed = client.post("/api/ideas/81/discuss", json={"horizon": "future", "facts": facts}).json()
        for original, adjusted in zip(base["options"], changed["options"], strict=True):
            for key in ["survival", "costs"]:
                assert adjusted["metrics"][key] == original["metrics"][key]
            assert adjusted["neuropathy"] == original["neuropathy"]
            assert adjusted["metrics"]["limitations"] == original["metrics"]["limitations"] + 10
            for key in ["quality", "mobility"]:
                assert adjusted["metrics"][key] == original["metrics"][key] - 10
            for before, after in zip(original["trajectory"], adjusted["trajectory"], strict=True):
                assert after["fatigue"] == before["fatigue"] + 10
                assert after["visits"] == before["visits"]
                assert after["recovery"] == before["recovery"]
        for horizon, reviewed in [
            ("six-months", facts),
            ("future", [fact for fact in facts if fact["key"] != "ecog"]),
            (
                "future",
                [{**fact, "status": "missing", "value": ""} if fact["key"] == "ecog" else fact for fact in facts],
            ),
            ("future", [{**fact, "status": "pending"} if fact["key"] == "ecog" else fact for fact in facts]),
            ("future", []),
        ]:
            response = client.post("/api/ideas/81/discuss", json={"horizon": horizon, "facts": reviewed})
            assert response.status_code == 200
            unchanged = response.json()
            for original, option in zip(base["options"], unchanged["options"], strict=True):
                assert option["metrics"] == original["metrics"]
                assert option["neuropathy"] == original["neuropathy"]
                assert option["trajectory"] == original["trajectory"]
            if horizon == "six-months":
                assert "personalized predictions are unavailable" in str(unchanged["context"])
                age = next(item["detail"] for item in unchanged["context"] if item["label"] == "Age")
                assert "mapped patient Age" in age
                assert "referral-letter" not in age
            if not reviewed:
                assert "Not supplied" in next(
                    item["detail"] for item in unchanged["context"] if item["label"] == "ECOG"
                )
                assert "Not supplied" in next(item["detail"] for item in unchanged["context"] if item["label"] == "CEA")
                assert "Penicillin" not in str(unchanged["context"])
                grounding = json.loads(grounded_calls[-1]["prompt"])
                assert grounding["reviewed_facts"] == []
                assert grounding["options"] == unchanged["options"]
                assert "Never invent or alter numbers" in grounded_calls[-1]["system_prompt"]
                assert "risk-reduction estimates" in str(grounding["context"])
                assert next(
                    item["detail"] for item in grounding["context"] if item["label"] == "Full simulation recipe"
                )
