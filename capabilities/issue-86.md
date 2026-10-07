---
issue: 86
title: "One audit trail for human and AI actions"
users: [health inspector, patient safety officer, clinician]
capabilities: [agentic-workflows, tool-use, human-in-the-loop]
ui_surfaces: ["Investigation worklist", "Episode timeline", "Decision evidence", "Inspector conclusion"]
api_endpoints: ["POST /api/ideas/86/review"]
agent_tools: ["read_audit_evidence"]
data: ["sample-data/issue-86-audit-events.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# One audit trail for human and AI actions

## Problem addressed
Investigators reconstruct adverse events from separate human and AI records. The prototype places the synthetic episode in one timeline and distinguishes what was available at a decision from what arrived later.

## Users
Health inspectors and patient-safety officers reviewing an oncology episode.

## Capability
Inspect a combined human/agent timeline, compare decision-time evidence with later records, and see a possible protocol deviation and similar synthetic patterns.

## Agent behaviour
The Copilot SDK reads only the synthetic episode evidence and prepares a neutral review. Without SDK access, a deterministic synthetic review keeps the walkthrough usable. Neither path decides root cause or responsibility.

## Inputs
Synthetic lab, agent, tumour-board, pharmacy, infusion and pathology records, plus the minimal tumour-board dataset definition.

## Outputs
A guided timeline, decision evidence, simulated integrity check and review findings.

## Human decisions
The inspector decides what is relevant, writes the root-cause conclusion and chooses corrective measures.

## Dependencies
Shared Copilot SDK runner and synthetic audit episode data.

## Major assumptions
The six-month view assumes hospitals can provide timestamps for when tumour-board data became available. Cross-system records, protocol comparisons and similar-incident analysis are future-platform demonstrations.
