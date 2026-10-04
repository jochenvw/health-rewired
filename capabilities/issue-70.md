---
issue: 70
title: "Is the patient ready for the tumour board?"
users: [coordinator]
capabilities: [proactive-agents, tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/70"]
api_endpoints: ["POST /api/ideas/70/check"]
agent_tools: ["check_board_sources", "render_ui"]
data: ["sample-data/issue-70-board.json"]
depends_on: []
---

# Is the patient ready for the tumour board?

## Problem addressed
Missing results postpone colorectal board decisions. Coordinators currently check several systems by hand.

## Users
The tumour board coordinator preparing next week's eight-patient colorectal worklist.

## Capability
A result-by-result checklist surfaces gaps immediately. Selecting a patient exposes source records,
missing-report reasons, suggested contacts and editable requests.

## Agent behaviour
The shared Copilot SDK runner uses `check_board_sources` to inspect synthetic pathology, molecular
pathology, radiology, laboratory and endoscopy records. It renders evidence and proposed request
blocks. Without configured AI, an explicitly labelled deterministic demo provides source-based drafts.

## Inputs
Eight fictional colorectal cases, informed by the diagnosis, MMR and CEA fields in
`sample-data/patients/P-003.json`. A fixed next-week board scenario is Thursday 15 October 2026.
Requirements are an illustrative local checklist, not a clinical guideline.

## Outputs
A readiness matrix, source evidence, requests with suggested recipients, simulated send receipts,
simulated received-report updates and an explicit human board decision.

## Human decisions
The coordinator edits, approves or dismisses every request, and chooses discussion or postponement.
A sent request never counts as a received result. Treatment decisions remain with the tumour board.

## Dependencies
Shared HospitalShell, StoryGuide, Backstage, UI block renderer and Copilot SDK runner.
The idea page and router are automatically discovered; no landing-page changes.

## Major assumptions
Hospital sources, messages and replies are simulated. No real systems are connected and no real
messages are sent. Follow-up and decisions live only in page state and reset on reload.
