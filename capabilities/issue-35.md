---
issue: 35
title: "Self-running European clinical trial engine"
users: [researcher, coordinator, oncologist]
capabilities: [agentic-workflows, tool-use, proactive-agents, structured-extraction, human-in-the-loop]
ui_surfaces: ["frontend/src/ideas/issue-35"]
api_endpoints: ["POST /api/ideas/35/run"]
agent_tools: ["screen_trial_engine"]
data: ["inline synthetic European trial launch data", "sample-data/patients/*.json"]
depends_on: []
---

# Self-running European clinical trial engine

## Problem addressed
European oncology trials recruit unevenly because potentially eligible patients, bottlenecks and comparable real-world controls are hard to see across institutions.

## Users
Trial coordinators, investigators and research nurses during the first launch weeks of a synthetic EGFR-mutant NSCLC study.

## Capability
The prototype screens synthetic site records, explains match or exclusion reasons, flags lagging sites and shows how a real-world comparator cohort could grow alongside recruitment.

## Agent behaviour
The issue-specific backend route calls the Copilot SDK agent with the `screen_trial_engine` tool. The agent is asked to review one lagging site, explain eligibility, draft outreach and propose synthetic comparator entries; a deterministic fallback keeps the demo working without a Copilot token.

## Inputs
Selected synthetic trial, selected European site, eligibility criteria, site recruitment counts and synthetic patient screening rows.

## Outputs
Hospital-style worklists, site forecast cards, match/exclusion explanations, outreach draft, comparator queue and human approval controls.

## Human decisions
Investigators confirm eligibility, coordinators approve outreach, patients and clinicians decide about participation, and statisticians approve any real-world evidence design.

## Dependencies
Uses the shared HospitalShell, StoryGuide, Backstage and generic UI block renderer.

## Major assumptions
In a real setting, hospitals would agree on federated data access, criteria harmonisation, consent workflows and statistical governance before any cross-site screening or comparator evidence is used.
