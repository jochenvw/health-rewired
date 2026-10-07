---
issue: 98
title: "Discover tacit clinical knowledge"
users: [oncologist, researcher, mdt-coordinator]
capabilities: [proactive-agents, retrieval, structured-extraction, human-in-the-loop, longitudinal-context, counterexample-analysis]
ui_surfaces: ["/#/idea/98: synthetic MDT workflow, weighted case comparison, explanation capture, knowledge review, population explorer"]
api_endpoints: ["POST /api/ideas/98/capture", "GET /api/ideas/98/analysis"]
agent_tools: ["render_ui", "shared sample-data tools"]
data: ["Deterministically generated synthetic colorectal decision episodes; sample-data/minimal-mdt-dataset.json for six-month coverage"]
depends_on: []
---

# Discover tacit clinical knowledge

## Problem addressed
Similar oncology cases may lead to different treatment choices because important clinical context is missing from structured data.

## Users
Tumour-board clinicians reviewing comparable stage III colorectal cancer cases.

## Capability
The prototype quietly detects a different pathway among weighted-comparable synthetic cases, elicits missing context, and shows how recurring observations and counterexamples may inform a candidate concept.

## Agent behaviour
The Copilot SDK interprets one short clinician explanation alongside three deterministically retrieved case summaries; it never receives the complete cohort. A deterministic fallback preserves the same walkthrough when the SDK is not configured. Code generates synthetic decision episodes, ranks comparisons, and calculates population counts and rates.

## Inputs
Configurable synthetic decision episodes (400–4,000 in the UI), structured context available at decision time, simulated post-decision clinician notes, treatment choices, and one clinician's free-text explanation.

## Outputs
Weighted comparison with inspectable matched variables, separate verbatim clinician wording and tentative interpretation, a versioned candidate knowledge item, maturity states, supporting notes and counterexamples, and computed population metrics.

## Human decisions
The clinician chooses treatment, may dismiss the notification, marks cases comparable or not, accepts/refines/rejects interpretations, and explicitly validates a candidate factor. A single observation does not become an accepted rule.

## Dependencies
Shared Copilot SDK runner, UI blocks, and `sample-data/minimal-mdt-dataset.json` for six-month coverage.

## Major assumptions
All episodes and patterns are synthetic and generated deterministically. Post-decision notes are excluded from similarity comparisons to avoid hindsight leakage. Cross-hospital population analysis belongs to the future horizon; validation and version history are local to the walkthrough and do not alter a real data model or establish clinical correctness.
