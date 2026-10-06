from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_similar_patients_walkthrough(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    client = TestClient(app)
    future = client.post("/api/ideas/92/cohort", json={}).json()
    assert future["patient"]["id"] == "P-046"
    assert future["count"] == 24
    assert "Confounding by indication" in future["warnings"][0]
    assert all(g["count"] == 12 for g in future["groups"])
    assert all(m["n"] <= g["count"] for g in future["groups"] for m in g["metrics"])
    total = next(g for g in future["groups"] if g["treatment"].startswith("Total"))
    five_year = total["metrics"][2]
    assert five_year["n"] == 11  # Last contact at 24 months is not five-year survival.
    assert five_year["events"] == 9
    assert five_year["low"] < five_year["percent"] < five_year["high"]
    for filters in ({"strict": True}, {"horizon": "six-month"}):
        small = client.post("/api/ideas/92/cohort", json=filters).json()
        assert all(m["percent"] is None and m["events"] is None for g in small["groups"] for m in g["metrics"])
    local = client.post("/api/ideas/92/cohort", json={"horizon": "six-month"}).json()
    assert local["count"] == 12
    assert all(r["site"] == "Munich" and r["ecog"] is None for r in local["records"])
    assert all(g["fit_count"] is None for g in local["groups"])
    assert any(e["name"] == "WHO performance status" and e["status"] == "partial" for e in local["coverage"])
    for language in ("English", "German"):
        response = client.post("/api/ideas/92/explain", json={"language": language, "strict": True})
        assert response.status_code == 200
        draft = response.json()
        assert draft["mode"] == "fallback"
        assert draft["note"]
        assert len(draft["blocks"][-1]["items"]) == 4
        assert ("zu klein" if language == "German" else "too small") in draft["blocks"][0]["body"]
