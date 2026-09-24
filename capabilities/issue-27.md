---
issue: 27
title: "Cohort explorer for a continuously learning oncology cohort"
users: [researcher, oncologist, coordinator]
capabilities: [tool-use, generative-ui, human-in-the-loop, retrieval-and-evidence-grounding]
ui_surfaces: ["#cohort (Cohort explorer section on the home page)"]
api_endpoints: ["POST /api/agent/run (trial_id/treatment/subgroup/outcome/simulate fields)"]
agent_tools: ["propose_cohort_rules", "build_cohort", "simulate_followup"]
data: ["sample-data/patients/*.json", "sample-data/trials.csv (structured eligibility columns)"]
depends_on: []
---

# Cohort explorer

## Problem addressed
For a chosen treatment, subgroup and outcome, researchers cannot easily see what actually happened
to patients in real life — including those who never qualified for a trial — without manually
assembling records and reconciling eligibility criteria across hospitals.

## Users
A researcher (or oncologist/coordinator) defining a clinical real-world-data question and reviewing
its evidence and open flags.

## Capability
Turns a treatment/trial + subgroup + outcome question into: explicit cohort rules to approve,
patient-level eligible/ineligible/unknown classification against a synthetic trial's structured
criteria (every classification traceable to its source record), a descriptive (non-causal) outcome
per patient, and a "simulate new data" rerun that explains what changed.

## Agent behaviour
Tools (`backend/app/agent/tools.py`, `backend/app/agent/cohort.py`): `propose_cohort_rules` drafts
the cohort question for approval; `build_cohort` classifies every synthetic patient and describes
outcomes; `simulate_followup` fabricates one fictional next lab record per patient (in-memory only)
so the question can be rerun. The agent never states that an observed difference proves a
treatment effect, and reports `unknown` rather than guessing when a criterion or outcome is not on
file. Same contract runs live (Copilot SDK) or via the deterministic fallback.

## Inputs
Selected trial (`sample-data/trials.csv`, now with structured `ecog_max` / `require_biomarker` /
`requires_stage_keyword` etc. columns alongside the free-text criteria), outcome type, and the
existing synthetic patient records/labs/imaging/timeline.

## Outputs
`actions` block (proposed rules to approve), `cohort` block (eligible/ineligible/unknown counts and
per-patient trail), `evidence` block (descriptive outcomes and, after simulate, "what changed"),
`alert` block (patients needing human review), review-queue `actions` block.

## Human decisions
The researcher approves/edits the proposed cohort rules, reviews and can override each
eligible/ineligible/unknown classification, and decides whether a flagged pattern warrants
investigation. The agent never recommends treatment, declares causality, or calls a cohort a valid
external control arm.

## Dependencies
Extends the existing patient/trial sample data and the generic `render_ui` block contract; no new
services.

## Major assumptions
A real deployment would need an authorised, permissioned European data platform, governance sign-off
for research reuse of care data, and clinical/statistical validation of any eligibility or outcome
signal before acting on it — this prototype only demonstrates the interaction loop on synthetic data.
