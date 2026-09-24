---
issue: 31
title: "Predict outcomes: multimodal outcome risk grounded in evidence"
users: [oncologist, coordinator]
capabilities: [multimodal-reasoning, retrieval-and-evidence-grounding, human-in-the-loop, proactive-agents]
ui_surfaces: ["#canvas outcome_risk block"]
api_endpoints: ["POST /api/agent/run"]
agent_tools: ["get_patient", "read_sample_data", "render_ui"]
data: ["sample-data/patients/*.json", "sample-data/trials.csv"]
depends_on: []
---

# Predict outcomes

## Problem addressed
Signals of a worsening outcome (a new indeterminate imaging finding, an abnormal biomarker trend)
are easy to miss when labs, imaging and the treatment timeline are reviewed as separate lists
instead of one connected picture.

## Users
The oncologist (or MDT coordinator preparing a case) reviewing a patient's progress between visits.

## Capability
The agent reasons across a patient's labs, imaging findings, biomarkers and treatment timeline
together, notices when signals combine into a possible outcome concern, and grounds the concern in
a specific matching synthetic clinical trial — so the reviewer sees *why* a risk is raised, not just
a number.

## Agent behaviour
Calls `get_patient` to read the full synthetic record, reasons over imaging, labs, biomarkers and
the timeline as one picture, searches `trials.csv` (via `read_sample_data`) for a trial whose
inclusion criteria match the patient's regimen and biomarkers, and calls `render_ui` with an
`outcome_risk` block containing the evidence trail and the matched trial. A deterministic
fallback (`app/agent/fallback.py`) builds the same block when the Copilot SDK is unavailable, so the
capability works with or without a live token.

## Inputs
`sample-data/patients/*.json` (labs, imaging, biomarkers, treatments, timeline) and
`sample-data/trials.csv`.

## Outputs
A new `outcome_risk` UI block (`backend/app/agent/ui.py`,
`frontend/src/blocks/OutcomeRiskBlock.tsx`): a risk-severity badge, a short narrative, an evidence
trail with sources, the matched trial, and Approve / Edit / Dismiss controls.

## Human decisions
The oncologist explicitly Approves, Edits or Dismisses the risk note. The agent never changes
treatment or refers to a trial on its own — it only prepares the case for a human decision.

## Dependencies
Builds on the starter agent (`backend/app/agent/`) and the existing patient/trials sample data.

## Major assumptions
In a real setting this would run against curated, consented patient data and a live, regularly
updated trial registry, with the risk model validated against outcomes rather than the
keyword-overlap heuristic used here for the synthetic demo.
