---
issue: 56
title: "The cancer patient in the ICU"
users: [intensivist, oncologist]
capabilities: [tool-use, structured-extraction, retrieval-grounding, human-in-the-loop]
ui_surfaces: ["/#/idea/56"]
api_endpoints: ["GET /api/ideas/56/scenario", "POST /api/ideas/56/agent"]
agent_tools: ["list_sample_data", "read_sample_data", "get_patient", "render_ui"]
data: ["sample-data/patients/P-056.json", "sample-data/ideas/issue-56/*"]
depends_on: []
---

# The cancer patient in the ICU

## Problem addressed
When a cancer patient deteriorates overnight, the ICU team needs the oncology context quickly and the oncology team needs to hear how the ICU stay started.

## Users
The on-call intensivist during an urgent night consultation, with the treating oncologist as consultation partner and follow-up recipient.

## Capability
The prototype turns scattered synthetic oncology, surgery and treatment-wishes sources into an Onco-ICU card, queries descriptive federated outcome aggregates, and drafts a handover message.

## Agent behaviour
The issue endpoint runs the Copilot SDK agent with sample-data tools. It reads the synthetic patient record and issue-local source notes, flags missing information, keeps outcomes descriptive, and renders review blocks for the human clinician.

## Inputs
Synthetic oncology record, ICU vitals/labs and organ-failure score, treatment-wishes extract, treatment plan, pathology note, and synthetic aggregated ICU outcomes.

## Outputs
A guided HospitalShell page with the ICU worklist, Onco-ICU card, federated outcome panel with uncertainty, and editable oncology follow-up draft.

## Human decisions
Doctors decide ICU admission, treatment intensity, treatment limitations and family communication. The UI labels outcomes as descriptive and requires review before sending the follow-up message.

## Dependencies
Uses existing HospitalShell/StoryGuide frontend components, the shared sample-data reader, and the shared Copilot SDK runner.

## Major assumptions
Real use would require verified source-system integration, consent/governance for federated analytics, and local clinical policy for treatment-wishes documentation.
