---
issue: 98
title: "Discover tacit clinical knowledge"
users: [oncologist, researcher, mdt-coordinator]
capabilities: [proactive-agents, structured-extraction, human-in-the-loop, longitudinal-context]
ui_surfaces: ["/#/idea/98: synthetic MDT worklist, case comparison, observation capture, candidate-field review"]
api_endpoints: ["POST /api/ideas/98/capture"]
agent_tools: ["render_ui", "shared sample-data tools"]
data: ["Synthetic colorectal MDT cases and prior clinician observations"]
depends_on: []
---

# Discover tacit clinical knowledge

## Problem addressed
Similar oncology cases may lead to different treatment choices because important clinical context is missing from structured data.

## Users
Tumour-board clinicians reviewing comparable stage III colorectal cancer cases.

## Capability
The prototype notices an unexplained decision difference, elicits and structures the missing context, and presents recurring observations as a candidate data concept.

## Agent behaviour
The Copilot SDK structures the clinician's explanation as evidence. A deterministic demo fallback preserves the same walkthrough when the SDK is not configured.

## Inputs
Synthetic case characteristics, a guideline suggestion, treatment choices, and a clinician's free-text explanation.

## Outputs
Provenance-aware observation, similar synthetic remarks, and a candidate field definition with example values.

## Human decisions
The clinician chooses treatment, confirms the explanation, and approves, merges, or rejects the candidate field.

## Dependencies
Shared Copilot SDK runner, UI blocks, and `sample-data/minimal-mdt-dataset.json` for six-month coverage.

## Major assumptions
The cases and patterns are synthetic. Cross-hospital pattern finding belongs to the future horizon and is not represented as a real clinical recommendation.
