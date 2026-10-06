---
issue: 78
title: "Trials for this patient"
users: [oncologist, coordinator]
capabilities: [tool-use, generative-ui, retrieval-and-evidence-grounding, human-in-the-loop, proactive-agents]
ui_surfaces: ["/#/idea/78"]
api_endpoints: ["GET /api/ideas/78/context", "POST /api/ideas/78/review"]
agent_tools: ["inspect_trial_screening", "render_ui"]
data: ["sample-data/issue-78-trial-matching.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Trials for this patient

## Problem addressed
Help oncologists notice relevant trials without leaving the patient chart, and see the evidence still needed for screening.

## Users
An oncologist reviewing a colorectal patient after FOLFOX; a trial coordinator receiving a clinician-reviewed enquiry.

## Capability
A proactive local signal opens a criterion-by-criterion comparison of fictional recruiting trials. Supported criteria, conflicts and unknowns remain separate, with record and protocol sources.

## Agent behaviour
The shared Copilot SDK runner inspects the horizon-specific assessment and chooses evidence and action blocks for clinician review. An issue-specific deterministic fallback keeps the same workflow usable without credentials. Neither mode confirms eligibility or recommends treatment.

## Inputs
One synthetic patient, four fictional protocols, dated laboratory and report evidence, the minimal colorectal MDT dataset, and clinician notes.

## Outputs
Evidence tables, an assistant review, missing-evidence checklists and an editable local screening enquiry draft. Nothing is ordered, sent or filed.

## Human decisions
The oncologist reviews evidence and uncertainty, then explicitly approves a discussion draft, prepares missing-data checks, or dismisses a candidate. Identified conflicts block enquiry approval.

## Dependencies
HospitalShell, StoryGuide, Backstage, the shared SDK runner, existing UI blocks and file-based sample data. No new services or libraries.

## Major assumptions
All protocols, recruitment statuses and clinical evidence are fictional, assessed against the fixed synthetic snapshot date. Criteria are illustrative, not complete protocols. Experimental options are study descriptions, not patient-specific treatment recommendations.

In six months, only a local catalogue and mapped minimal-dataset fields are used. Clinic-note performance status and history remain unknown. Molecular and CT findings assume the fictional hospital has started structuring those reports; likely sources are hackathon assumptions. Hospitals must map units and dates, structure reports and maintain a reviewed catalogue.

The future adds a simulated partner catalogue, not live registry retrieval or federated patient queries. Drafts remain session-local in both horizons; refreshing discards them. Real implementation needs current complete protocols, consent and patient preference review, institutional agreements, and trial-team verification.
