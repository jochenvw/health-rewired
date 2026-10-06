---
issue: 91
title: "Drug Safety Monitor"
users: [data-scientist, pharmacovigilance-lead, oncologist]
capabilities: [proactive-agents, structured-extraction, tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/91"]
api_endpoints: ["GET /api/ideas/91/monitor", "POST /api/ideas/91/agent"]
agent_tools: [render_ui]
data: ["sample-data/drug-safety-91.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Drug Safety Monitor

## Problem addressed
Safety monitoring of new cancer treatments should not require a fresh ad hoc study for each concern.

## Users
A hospital data scientist or pharmacovigilance lead reviewing the Monday safety worklist.

## Capability
A guided synthetic workflow: treatment starts, candidate adverse events, descriptive trial comparison,
older-patient subgroup, source inspection, note review and an editable periodic safety report.
Six-month mode provides lab-based monitoring and a local summary, with unavailable steps shown explicitly.

## Agent behaviour
The shared Copilot SDK reviews supplied synthetic records and uses `render_ui` for evidence,
alerts and a report draft. Without authentication, a labelled prepared demo provides the same story.
Lab counts and candidate grades are deterministic; note candidates in the demo are prepared fixtures.
Scheduled monitoring and alert routing are simulated, not background services.

## Inputs
Eighteen fictional colorectal cancer records with treatment starts, normal baseline ALT, dated labs,
notes, admission detail and fictional trial rates. Coverage is read from the minimal dataset working list.

## Outputs
Drug worklist, descriptive rates with denominators, candidate CTCAE v5.0 grades, patient-level sources,
generative UI blocks and an editable report or lab-only summary.

## Human decisions
Sources and grades must be reviewed and a causality assessment selected before local approval.
The reviewer may edit, dismiss or reopen the draft. Authority reporting and care changes remain human
decisions; nothing is submitted or written back. Approval state lasts only for the current page visit.

## Dependencies
Existing agent runner, sample-data reader, UI block registry and StoryGuide/Backstage components.

## Major assumptions
All therapies, approvals, trial rates and patient records are fictional. Small cohorts and unmatched
follow-up do not establish excess risk; ALT increases do not diagnose immune hepatitis.
Hospitals must agree regular dated lab export, exact treatment starts and reference limits:
the minimal working list alone does not promise continuous surveillance.
Real regulatory formats, pooling and real hospital connections are deferred.
