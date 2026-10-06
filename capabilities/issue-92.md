---
issue: 92
title: "Patients like me"
users: [patient, oncologist, nurse]
capabilities: [tool-use, generative-ui, human-in-the-loop, role-specific-agents]
ui_surfaces: ["/#/idea/92"]
api_endpoints: ["POST /api/ideas/92/cohort", "POST /api/ideas/92/explain"]
agent_tools: ["find_similar_patients", "render_ui"]
data: ["sample-data/patients/P-046.json", "sample-data/patients-like-me-history.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Patients like me

## Problem addressed
Patients want to understand what happened to people with similar cancer, without mistaking
observational differences for proof that one treatment is better.

## Users
Patient and oncologist together, during a colorectal cancer treatment consultation.

## Capability
A guided comparison of fictional historical treatments and outcomes, with match explanations,
known-outcome denominators, illustrative uncertainty ranges and small-group suppression.

## Agent behaviour
The Copilot SDK calls `find_similar_patients` to inspect calculated aggregates and warnings,
then chooses UI blocks explaining similarities, limitations and consultation questions.
An explicitly labelled deterministic demonstration works without a token.

## Inputs
The preselected synthetic P-046 chart, historical fictional records, horizon, matching strictness,
English or German, and plain or detailed explanations.

## Outputs
Treatment counts, observed one-, three- and five-year survival proportions, recurrence and severe
side effects, fitness imbalance warnings, and an editable take-home draft.

## Human decisions
The clinician decides whether to use the comparison. The patient and oncologist decide treatment.
Drafts can be edited, dismissed or approved locally; approval does not write to a hospital chart.

## Dependencies
Shared HospitalShell, StoryGuide, Backstage, UI block renderer, sample-data reader and agent runner.

## Major assumptions
All histories and hospital pooling are fictional, not measured real-world evidence. Matching uses
tumour site, stage, MSI, age band and (future only) recorded fitness; other illnesses and KRAS are
not matched. A minimum of ten known observations per treatment/measure is a demo threshold, not a
validated clinical standard. Wilson 95% intervals express sampling uncertainty only.
Observed proportions omit incomplete follow-up and are not Kaplan–Meier estimates.

The six-month view uses one hospital, with fitness and toxicity clinic-note gaps visible and
small treatment groups withheld. Hospitals would need to map treatment and follow-up fields,
structure pathology/staging reports, and agree outcome definitions and clinician review.
Future multi-hospital pooling is simulated from the same local synthetic file, not a live service.
