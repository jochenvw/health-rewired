---
issue: 52
title: "Say the tumour board decision in words the patient and the GP understand"
users: [nurse, oncologist, patient, coordinator]
capabilities: [tool-use, human-in-the-loop, source-linked-drafting, translation, health-literacy]
ui_surfaces: ["/#/idea/52 – post-MDT communication screen in HospitalShell"]
api_endpoints:
  - "GET /api/ideas/52/cases"
  - "GET /api/ideas/52/case/{patient_id}"
  - "POST /api/ideas/52/explain"
agent_tools: ["get_mdt_case", "save_explanation"]
data:
  - "sample-data/patients/P-010.json"
  - "sample-data/patients/P-011.json"
  - "sample-data/notes/P-010-*.md"
  - "sample-data/notes/P-011-*.md"
depends_on: []
---

# An MDT decision patients and GPs understand

## Problem addressed
After the tumour board, patients hear a decision full of jargon, often not in their own language,
at an emotional moment, while the GP receives a technical letter that may not match what the
patient was told.

## Users
The nurse specialist or oncologist preparing the post-MDT consultation; afterwards the patient at
home (portal text, comprehension questions) and the GP (letter).

## Capability
From one MDT conclusion plus the pathology and imaging reports, the agent drafts the explanation in
the patient's language (Dutch, Italian, English) at two reading levels, a matching German GP letter
and three comprehension-check questions. Every sentence keeps a link to the source document it came
from, and sentences that are easily misunderstood are flagged for the clinician.

## Agent behaviour
`get_mdt_case` reads the synthetic case (decision, options with benefits and drawbacks, source
reports, language preference, health literacy). The agent then writes sentence-level output and
finishes with the terminal tool `save_explanation`. Without a Copilot token the same package comes
from the deterministic drafts in `backend/app/ideas/issue_52_drafts.py`.

## Inputs
Synthetic patient records with a `communication` profile, MDT conclusion, pathology and radiology
notes, plus the clinician's chosen language and reading level.

## Outputs
Patient explanation (editable, source-linked, risk-flagged), German GP letter, comprehension
questions, a visual care timeline and a patient-portal preview.

## Human decisions
Nothing is sent until the clinician approves it: sentences are edited inline and approved one by
one, the portal preview only contains approved sentences, and the GP letter needs an explicit
"Approve and send". The treatment choice stays between patient and doctor; the agent adds no
prognosis or independent advice.

## Dependencies
`app.agent.run_agent` (Copilot SDK), `HospitalShell`, `StoryGuide`/`Backstage`.

## Major assumptions
In reality the MDT conclusion and reports would come from the EHR, the patient text would go to a
real portal, the GP letter to the practice system, and translations would need clinical language
validation.
