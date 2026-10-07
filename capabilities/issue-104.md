---
issue: 104
title: "Post-MDT shared decision making"
users: [oncologist, patient, nurse]
capabilities: [tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/104"]
api_endpoints: ["POST /api/ideas/104/explain"]
agent_tools: ["read_shared_decision_context"]
data: ["sample-data/issue-104.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Post-MDT shared decision making

## Problem addressed
Patients and clinicians need to compare colon cancer treatment trade-offs after the tumour board,
especially when there is no single clear-cut option.

## Users
The patient, clinician and optionally caregiver in the post-MDT consultation.

## Capability
A guided worklist-to-decision walkthrough compares three synthetic choices, including no additional
chemotherapy with follow-up (“No treatment / Do nothing”). Germany, Italy
and Netherlands selectors change teaching wording and guideline source pointers. Separate sliders
change preference fit, never the medical risk numbers. Every consequential element has expandable
reasoning. Live bars beside the sliders and example priorities demonstrate how fit changes immediately.
Clinical outcomes stay separate and fixed. Guideline/trial pointers, an explicitly unconnected
prediction-model module and observational examples have separate provenance and limitations.
Plain-language definitions and an assistant explanation support the conversation.

## Agent behaviour
The shared Copilot SDK runner uses a read-only consultation tool and renders summary/evidence
blocks. Without credentials, an issue-specific deterministic explanation keeps the walkthrough usable.
Neither mode retrieves full guidelines, calculates a validated personal risk or chooses treatment.

## Inputs
A synthetic 68-year-old stage III colon cancer scenario, unverified teaching summaries, source
links, patient priorities, selected country and horizon. Future “Patients like me” uses invented European
records filtered by age within five years, stage III and any tied highest-rated priority. No priorities
means no matches. Coverage uses actual minimal-dataset fields.

## Outputs
Risk/benefit matrix, simulated future icon arrays and fatigue trajectories, generated explanation
blocks, six-month coverage panel and a local receipt of the joint decision or deferral. The future
learning-loop preview captures the selected option, preferences, context and evidence limitations.

## Human decisions
The patient and clinician choose or defer treatment, edit the conversation note and explicitly confirm
review before recording. Separate consent is required for the simulated learning-loop contribution.
Edits invalidate the receipt and contribution. No automatic choice, transmission, training, persistence
or EHR write-back.

## Dependencies
Existing HospitalShell, StoryGuide, Backstage, generated block registry and shared Copilot runner.
No new dependencies or infrastructure.

## Major assumptions
All summaries, risks, preference scores and trajectories are invented teaching material, not
guideline-derived evidence or validated predictions. National guideline texts remain unverified;
no country-specific efficacy differences are claimed. Costs are unavailable in both horizons.
Six months offers qualitative summaries, priorities and a local conversation note; personalised
probabilities, trajectories, comparable longitudinal cases and learning-loop linkage remain unavailable
pending richer records, validated models, consent and governance. No clinical confidence algorithm
or evidence-based best option is claimed. Observational examples are not causal comparisons.
