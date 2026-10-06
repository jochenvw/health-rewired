---
issue: 100
title: "Oncology research data trust"
users: [researcher, data_manager]
capabilities: [tool-use, retrieval-evidence-grounding, structured-extraction, human-in-the-loop]
ui_surfaces: ["/#/idea/100: research question, claim evidence, local-rule review, analysis comparison"]
api_endpoints: ["POST /api/ideas/100/manager-answer"]
agent_tools: ["ask_local_data_manager"]
data: ["Issue-local synthetic hospital counts and source lineage"]
depends_on: []
---

# Oncology research data trust

## Problem addressed
Researchers need to know whether apparently agreeing hospital counts are independent evidence and whether hospitals count the same thing before comparing outcomes.

## Users
An oncology researcher preparing a multi-hospital procedure-volume and outcome study, with a local data manager clarifying a site's counting rule.

## Capability
The prototype calculates a fixed, visible claim-level trust score and confidence separately, exposes source lineage and disagreements, and propagates count uncertainty into a simulated analysis.

## Agent behaviour
The Copilot SDK asks a simulated local data manager for the reason behind a count, then extracts and explains a candidate local rule. It cannot change the deterministic score or apply the rule without human approval.

## Inputs
Inline synthetic counts from two hospitals, six source records, lineage relationships, and the manager's scripted synthetic explanation.

## Outputs
A guided research evidence workspace, inspectable score and sources, a candidate local rule, and naive versus 500-run uncertainty-aware research results.

## Human decisions
The researcher approves, edits, or dismisses the candidate definition and judges whether to rely on the research result.

## Dependencies
The shared FastAPI Copilot SDK runner, issue-local synthetic evidence and the minimal tumour-board dataset for the six-month coverage view.

## Major assumptions
The initial trust weights are a documented heuristic rather than calibrated evidence. In six months, hospitals must supply a qualifying-procedure aggregate with its source and definition; this field is not in the current minimal dataset.
