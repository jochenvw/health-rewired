import unittest

from fastapi import HTTPException

from app.mdo import (
    DEMO_CASE,
    DEMO_DECISION,
    build_discussion,
    generate_documents,
    validate_decision,
    voice_config,
)
from app.models import CommunicationPreferences, MDODecision


class MDOTests(unittest.TestCase):
    def test_generated_documents_only_use_case_and_decision_facts(self):
        result = generate_documents(DEMO_CASE, DEMO_DECISION, CommunicationPreferences(literacy="simple"))
        self.assertIn(DEMO_CASE.diagnosis, result["patient_summary"])
        self.assertIn(DEMO_DECISION.rationale, result["patient_summary"])
        self.assertEqual(len(result["provenance"]), len(DEMO_CASE.facts))
        self.assertNotIn("prognosis", result["patient_summary"].lower())

    def test_draft_decision_cannot_generate_documents(self):
        draft = DEMO_DECISION.model_copy(update={"status": "draft", "approved_by": None})
        with self.assertRaises(HTTPException) as context:
            generate_documents(DEMO_CASE, draft, CommunicationPreferences())
        self.assertEqual(context.exception.status_code, 409)

    def test_approval_requires_clinician_unless_overridden(self):
        incomplete = MDODecision(
            outcomes=["Defer"],
            rationale="Missing imaging.",
            actions=[{"action": "Obtain scan", "owner": "", "due": "Soon"}],
            status="approved",
        )
        with self.assertRaises(HTTPException) as context:
            validate_decision(incomplete)
        self.assertEqual(context.exception.status_code, 422)

        overridden = incomplete.model_copy(update={"override_missing": True})
        self.assertIn("approving clinician", validate_decision(overridden))

    def test_speakers_are_strictly_sequenced_and_end_at_checkpoint(self):
        turns = build_discussion(DEMO_CASE, detailed=True)
        self.assertEqual([turn["sequence"] for turn in turns], list(range(len(turns))))
        self.assertEqual(turns[-1]["kind"], "chair_summary")
        self.assertIn("approve", turns[-1]["text"])

    def test_all_specialists_have_browser_voice_fallback(self):
        voices = voice_config()
        self.assertEqual(len(voices), 8)
        for voice in voices:
            self.assertIn(voice["provider"], ("ElevenLabs", "Browser fallback"))


if __name__ == "__main__":
    unittest.main()
