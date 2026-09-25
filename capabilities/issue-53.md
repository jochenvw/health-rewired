---
issue: 53
title: "Rectal-cancer quality signal to improvement loop"
users: [oncologist, coordinator, researcher]
capabilities: [tool-use, proactive-agents, agentic-workflows, human-in-the-loop]
ui_surfaces: ["#/idea/53"]
api_endpoints: ["GET /api/ideas/53/quality-snapshot", "POST /api/ideas/53/assistant"]
agent_tools: ["get_rectal_quality_signal"]
data: ["sample-data/rectal-quality-network.json"]
depends_on: []
---

# Rectal-cancer quality signal to improvement loop

## Problem addressed
Hospital networks learn too late that one site is deviating on rectal-cancer pathway quality. This prototype shows a quarterly signal being detected, explained and turned into a concrete improvement action within weeks.

## Users
Tumour working group chairs and quality coordinators use it during a hospital-network quality meeting.

## Capability
The page compares eight hospitals using locally calculated totals, flags Hospital F's time-to-treatment deviation, traces it to MRI waiting time and simulates the next-quarter effect of adding MRI capacity.

## Agent behaviour
The idea-specific assistant calls `get_rectal_quality_signal`, checks patient mix against process steps, proposes five anonymised Hospital F cases and drafts the audit agenda. If the Copilot SDK is unavailable, the same route returns a deterministic demo result.

## Inputs
Synthetic rectal-cancer registry and pathway aggregates from `sample-data/rectal-quality-network.json`, plus the user's request to investigate Hospital F.

## Outputs
A guided network quality dashboard, assistant UI blocks, five anonymised audit cases, a draft agenda, an approved improvement action and a data-flow panel showing that patient-level rows stayed local.

## Human decisions
Clinicians decide whether the deviation is clinically relevant, whether to approve the audit agenda, which improvement action to try and whether any comparison should be published.

## Dependencies
No other idea pages or infrastructure. The prototype uses the shared Copilot SDK runner and hospital story components.

## Major assumptions
Each hospital can calculate the same indicator definitions locally and share aggregate numerators, denominators and pathway medians for the meeting.
