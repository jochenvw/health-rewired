---
issue: 88
title: "One front door for oncology data requests"
users: [CIO, data-steward, researcher]
capabilities: [agentic-workflows, structured-extraction, generative-ui, human-in-the-loop, proactive-agents]
ui_surfaces: ["/#/idea/88"]
api_endpoints: ["GET /api/ideas/88/catalogue", "POST /api/ideas/88/assess"]
agent_tools: ["assess_oncology_request", "render_ui"]
data: ["sample-data/issue-88-requests.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# One front door for oncology data requests

## Problem addressed
External oncology requests should share a catalogue and intake route rather than fund a separate extraction each time.

## Users
Requesters check feasibility; data stewards review completeness; the CIO sees reuse and investment proposals.

## Capability
A guided stage III colorectal request moves from a DCAT-shaped JSON-LD catalogue through intake, variable matching, missing-permit flags and proposed extraction reuse to a human review plan.

## Agent behaviour
The shared Copilot SDK maps free text, calls a read-only feasibility tool, and chooses evidence, alerts and proposed-action UI blocks. A labelled keyword-based demo works without credentials.

## Inputs
Synthetic catalogue, requests and earlier extractions; the minimal MDT working list supplies actual element names and source assumptions. Purpose and permit references come from the intake form.

## Outputs
Variable availability, simulated site/stage counts, scope limitations, completeness flags, reuse proposal and CIO request worklist.

## Human decisions
Approve a review/reuse plan, edit scope or send back. Legal assessment, investment and access decisions remain human; no data is delivered and no permit is verified.

## Dependencies
Shared sample-data access, Copilot runner, generative UI blocks and story components. No additional services.

## Major assumptions
All counts, requests, permits and extraction histories are synthetic. Catalogue dates are fixture dates, not evidence of live refresh. The DCAT-shaped description is not a certified EHDS catalogue. Six-month feasibility requires each hospital to map the minimal dataset and structure staging reports; completeness is unknown. Federated linkage, common-data-model reuse, permit verification and delivery remain future capabilities.
