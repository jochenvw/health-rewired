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
A guided worklist-to-decision walkthrough compares two synthetic treatment options. Germany, Italy
and Netherlands selectors change teaching wording and guideline source pointers. Separate sliders
change preference fit, never the medical risk numbers. Every consequential element has expandable
reasoning. Plain-language definitions and an assistant explanation support the conversation.

## Agent behaviour
The shared Copilot SDK runner uses a read-only consultation tool and renders summary/evidence
blocks. Without credentials, an issue-specific deterministic explanation keeps the walkthrough usable.
Neither mode retrieves full guidelines, calculates a validated personal risk or chooses treatment.

## Inputs
A synthetic 68-year-old stage III colon cancer scenario, unverified teaching summaries, source
links, patient priorities, selected country and horizon. Coverage uses actual minimal-dataset fields.

## Outputs
Risk/benefit matrix, simulated future icon arrays and fatigue trajectories, generated explanation
blocks, six-month coverage panel and a local receipt of the joint decision or deferral.

## Human decisions
The patient and clinician choose or defer treatment, edit the conversation note and explicitly confirm
review before recording. No automatic choice, persistence or EHR write-back.

## Dependencies
Existing HospitalShell, StoryGuide, Backstage, generated block registry and shared Copilot runner.
No new dependencies or infrastructure.

## Major assumptions
All summaries, risks, preference scores and trajectories are invented teaching material, not
guideline-derived evidence or validated predictions. National guideline texts remain unverified;
no country-specific efficacy differences are claimed. Costs are unavailable in both horizons.
Six months offers qualitative summaries, priorities and a local conversation note; personalised
probabilities and trajectories remain unavailable pending richer records and validated models.
