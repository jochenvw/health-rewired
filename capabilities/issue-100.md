---
issue: 100
title: "Oncology research data trust"
users: [researcher, data_manager]
capabilities: [tool-use, retrieval-evidence-grounding, structured-extraction, dataset-quality-analysis, definition-sensitivity, human-in-the-loop]
ui_surfaces: ["/#/idea/100: synthetic cohort definition lab, hospital comparison, case evidence, human-approved definition refinement, claim evidence, analysis comparison"]
api_endpoints: ["GET /api/ideas/100/dataset", "POST /api/ideas/100/dataset/analyze", "POST /api/ideas/100/dataset-explanation", "POST /api/ideas/100/manager-answer"]
agent_tools: ["ask_local_data_manager", "read_dataset_discrepancies"]
data: ["Fixed-seed synthetic cohort of 24,000 oncology patients across 12 fictional hospitals, generated in Python; source lineage, missingness, definition-sensitive procedure counts, and representative synthetic cases"]
depends_on: []
---

# Oncology research data trust

## Problem addressed
Researchers need to know whether apparently agreeing hospital counts are independent evidence and whether hospitals count the same thing before comparing outcomes.

## Users
An oncology researcher preparing a multi-hospital procedure-volume and outcome study, with a local data manager clarifying a site's counting rule.

## Capability
The prototype calculates dataset-level source completeness and definition-sensitive cohort summaries, compares hospital definitions, exposes representative case lineage, and separately calculates a fixed claim-level trust score and confidence. It propagates count uncertainty into a simulated analysis.

## Agent behaviour
The Copilot SDK asks a simulated local data manager for the reason behind a count, extracts and explains a candidate local rule, and grounds a population discrepancy explanation in a read-only synthetic data tool. It cannot change deterministic metrics or apply the v2 definition without researcher approval.

## Inputs
Fixed-seed Python-generated synthetic oncology cohort, hospital procedure counts and definitions, source modalities and lineage, representative cases, and the manager's scripted synthetic explanation. The minimal MDT dataset supplies the six-month horizon coverage view.

## Outputs
A guided research evidence workspace, dataset-level quality and semantic-sensitivity summaries, hospital comparison, inspectable case sources, a candidate versioned definition, and naive versus 500-run uncertainty-aware research results.

## Human decisions
The researcher approves, edits, or dismisses the candidate definition and judges whether to rely on the research result.

## Dependencies
The shared FastAPI Copilot SDK runner, issue-local synthetic evidence and the minimal tumour-board dataset for the six-month coverage view.

## Major assumptions
All cohort values, source records, examples, and before/after refinement audit values are illustrative synthetic data generated from a fixed seed; they are not empirical or clinically validated findings. Initial trust weights are a documented heuristic rather than calibrated evidence. In six months, hospitals must supply a qualifying-procedure aggregate with its source and definition; this field is not in the current minimal dataset.
