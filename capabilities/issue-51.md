---
issue: 51
title: "Silent-run model check workspace"
users: [oncologist, researcher]
capabilities: [tool-use, retrieval-and-evidence-grounding, human-in-the-loop]
ui_surfaces: ["frontend/src/ideas/issue-51"]
api_endpoints: ["GET /api/ideas/51/snapshot", "POST /api/ideas/51/passport"]
agent_tools: ["get_model_validation_snapshot"]
data: ["sample-data/model-validation/issue-51-hospitals.json"]
depends_on: []
---

# Silent-run model check workspace

## Problem addressed
Hospitals need to test an oncology AI model locally before trusting it in care. The prototype shows a safe silent-run check for an immunotherapy-response model in advanced NSCLC.

## Users
Hospital AI implementation teams and oncologists preparing a decision committee review.

## Capability
The workspace maps local variables, compares local silent-run performance with the publication, surfaces subgroup and drift concerns, simulates recalibration and drafts a model passport.

## Agent behaviour
The passport agent reads the synthetic validation snapshot, explains why one hospital differs and prepares evidence blocks for committee review.

## Inputs
Synthetic hospital cohorts, variable mapping status, publication metrics, subgroup checks, drift timeline and recalibration results.

## Outputs
A guided model-check workspace, performance tables, drift evidence, recalibration comparison and a draft passport with explicit sign-off choices.

## Human decisions
The committee decides whether to introduce, recalibrate, continue silent running or pause the model. The UI makes sign-off explicit and states predictions stay hidden during silent running.

## Dependencies
Uses the shared Copilot agent runner and synthetic JSON in `/sample-data`.

## Major assumptions
Real deployment would need approved local data access, governed variable mapping, prospective monitoring and clinical safety review before any prediction reaches care.
