---
issue: 90
title: "Data access desk"
users: [data-steward, researcher, coordinator]
capabilities: [structured-extraction, tool-use, generative-ui, human-in-the-loop, proactive-agents, role-specific-agents]
ui_surfaces: ["/#/idea/90"]
api_endpoints: ["GET /api/ideas/90/desk", "POST /api/ideas/90/assess"]
agent_tools: [assess_data_access, render_ui]
data: ["sample-data/issue-90-access-desk.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Data access desk

## Problem addressed
Routine oncology data requests wait for approvals even when they match previously approved conditions.

## Users
Data stewards reviewing exceptions and the weekly log of automatic approvals.

## Capability
Check task-specific purposes, fields and scope against readable machine rules; approve exact matches and prepare exceptions.

## Agent behaviour
The Copilot SDK structures and explains a synthetic request, calls `assess_data_access`, renders assessment blocks and proposes a scoped rule from three repeated research exceptions. The deterministic policy result remains authoritative. Without a token, seeded extraction and rule suggestions are clearly labelled demo examples.

## Inputs
Synthetic free-text requests, consent and permit status, approved rules, historical decisions and the minimal colorectal dataset.

## Outputs
Structured request, condition-by-condition checks, near-match differences, session-local decision log and a research rule draft.

## Human decisions
Approve or decline unmatched requests; accept or reject the suggested rule. Human decisions and rule changes are session-only simulations, not real access grants.

## Dependencies
Shared Copilot runner, UI block registry, story components and sample-data reader. No dependency on another idea.

## Major assumptions
Consent and purpose-specific permits must be recorded in fixed forms and hospitals must agree on rules. Six months supports local internal purposes with minimal fields, not research or live cross-hospital patient-level access. Real consent registers, enforcement and multi-country rules are not connected.
