---
issue: 57
title: "Design trials around Europe's real patient population"
users: [researcher, coordinator]
capabilities: [tool-use, generative-ui, human-in-the-loop, federated-counts]
ui_surfaces: ["#/idea/57", "frontend/src/ideas/issue-57/index.tsx"]
api_endpoints: ["GET /api/ideas/57/feasibility", "POST /api/ideas/57/agent"]
agent_tools: ["federated_trial_feasibility", "render_ui"]
data: ["sample-data/trial-design/issue-57-population.json"]
depends_on: []
---

# Design trials around Europe's real patient population

## Problem addressed
Researchers designing oncology trials cannot see early enough how copied eligibility criteria exclude
the real registry population, especially older patients and people with comorbidities.

## Users
Trial coordinators and clinical researchers before regulatory and ethics submission.

## Capability
The prototype turns draft free-text criteria into reviewable rules, runs synthetic federated centre
counts, shows the eligibility funnel and compares strict versus adjusted kidney-function criteria.

## Agent behaviour
The issue-local agent uses `federated_trial_feasibility` and renders UI blocks that flag the eGFR
threshold, the older-patient exclusion effect and the human protocol decision.

## Inputs
Draft protocol criteria plus the synthetic six-centre trial-design population in `/sample-data`.

## Outputs
Reviewable rules, centre-level eligible counts, exclusion-reason tables, representativeness measures
and protocol decision buttons.

## Human decisions
Researchers explicitly approve the rule set and choose whether to keep the strict eGFR threshold or
send the adjusted threshold for protocol-team review.

## Dependencies
Uses the existing FastAPI idea-router discovery, Copilot agent runner, generative UI blocks and
hospital story components.

## Major assumptions
A real deployment would need governed federated data access, harmonised registry definitions and
clinical safety review for any relaxed eligibility criterion.
