---
issue: 54
title: "Detect immunotherapy side effects between visits"
users: [nurse, oncologist]
capabilities: [tool-use, retrieval-and-evidence-grounding, structured-extraction, human-in-the-loop]
ui_surfaces: ["/#/idea/54", "frontend/src/ideas/issue-54"]
api_endpoints: ["GET /api/ideas/54/worklist", "POST /api/ideas/54/assistant"]
agent_tools: ["get_issue54_triage_case"]
data: ["sample-data/ideas/issue-54/toxicity-worklist.json"]
depends_on: []
---

# Detect immunotherapy side effects between visits

## Problem addressed
Checkpoint-immunotherapy side effects can appear between visits, while symptoms, labs, notes and outside-hospital signals sit in different places.

## Users
Oncology nurse specialists and triage nurses use it when reviewing calls and digital symptom reports between cycles; oncologists use the same evidence at review.

## Capability
The prototype ranks a synthetic triage worklist by possible immune-related toxicity and opens each patient into one combined evidence view.

## Agent behaviour
The issue-local assistant reads a selected synthetic triage case, combines symptoms, laboratory trends, notes and synthetic network outcomes, then proposes a CTCAE grade, protocol step and draft triage note.

## Inputs
Synthetic symptom reports, longitudinal lab rows, notes, external encounter hints and network outcome counts from `sample-data/ideas/issue-54/toxicity-worklist.json`.

## Outputs
A ranked worklist, patient evidence tabs, proposed grade rationale, protocol step, similar-case frequency and a triage note for human review.

## Human decisions
The nurse explicitly chooses whether to call, order tests, arrange same-day assessment or mark low-risk. The prototype never contacts patients or advises stopping treatment independently.

## Dependencies
Uses the existing FastAPI idea-router discovery, GitHub Copilot SDK runner, React idea-page discovery and HospitalShell components.

## Major assumptions
Synthetic patterns stand in for a future connected network. Real deployment would need validated protocols, local governance and integration with clinical triage systems.
