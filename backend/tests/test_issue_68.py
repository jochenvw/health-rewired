from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_board_readiness_and_reminder_demo(monkeypatch):
    monkeypatch.setattr(settings, "copilot_token", None)
    monkeypatch.setattr(settings, "copilot_use_logged_in_user", False)
    with TestClient(app) as client:
        board = client.get("/api/ideas/68/board").json()
        assert board["synthetic"] is True
        assert len(board["patients"]) == 5
        eva, paul, mira = board["patients"][:3]
        assert eva["missing_count"] == 2
        assert paul["missing_count"] == 0
        assert mira["results"][1]["state"] == "outdated"
        response = client.post("/api/ideas/68/review", json={"patient_id": eva["id"]})
        assert response.status_code == 200
        review = response.json()
        assert review["assessment"]["mode"] == "fallback"
        assert {r["id"] for r in review["reminders"]} == {"staging", "mmr"}
        assert review["reminders"][0]["recipient"] == "Radiology team"
        assert eva["id"] in review["reminders"][0]["message"]
        assert review["assessment"]["blocks"][0]["items"][0]["source"].endswith("issue-68-board.json")
        assert client.post("/api/ideas/68/review", json={"patient_id": paul["id"]}).json()["reminders"] == []
        assert client.post("/api/ideas/68/review", json={"patient_id": "unknown"}).status_code == 404
