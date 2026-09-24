---
issue: 37
title: "A Europe-wide learning treatment system"
users: [oncologist, researcher]
capabilities: [tool-use, agentic-workflows, retrieval-and-evidence-grounding, human-in-the-loop-workflows, proactive-agents]
ui_surfaces: ["frontend/src/ideas/issue-37 (/#/idea/37)"]
api_endpoints: ["POST /api/ideas/37/query", "GET /api/ideas/37/network/{patient_id}", "POST /api/ideas/37/feedback", "GET /api/ideas/37/log"]
agent_tools: ["query_eu_network", "prepare_outcome_feedback"]
data: ["sample-data/patients/P-002.json", "sample-data/eu_network/hospitals.json", "sample-data/eu_network/cohort.json"]
depends_on: []
---

# A Europe-wide learning treatment system

## Problem addressed
An oncologist's patient does not fit any trial population. Local experience and ad hoc literature
searches cannot show what happened to comparable patients elsewhere in Europe.

## Users
The treating oncologist, during a tumour board discussion, deciding what to do about a new,
ambiguous finding in a patient who is otherwise responding to treatment.

## Capability
For one synthetic patient (Markus Huber, P-002 – EGFR-mutant lung adenocarcinoma with a new
indeterminate nodule after partial response on osimertinib), the assistant sends a structured,
privacy-preserving comparability query to a simulated network of nine European hospitals, groups
the comparable patients by the treatment approach they received, shows what happened to them, and
explicitly flags when the evidence is thin, one-sided or immature.

The primary UI is deterministic and visual, not a chat panel: a live map of the nine hospital
nodes shows each one searching locally and returning only a match count (never raw records), a
country-mix bar makes geographic concentration visible at a glance, and a cohort landscape renders
one lane per treatment approach with one dot per matched patient, coloured by outcome. Two toggles
("hide weak evidence", "mature follow-up only") let the clinician see the evidence change shape
when thin or immature matches are removed. A narrative explanation from the Copilot agent is
shown alongside as a secondary panel, not the primary surface. Recording an outcome visibly pulses
the feedback back into the network map.

## Agent behaviour
1. `get_patient` reads the local patient's profile.
2. `query_eu_network` matches it (same cancer type, EGFR-mutant status, oligometastatic stage)
   against a simulated cohort of aggregated cases from participating hospitals, returning only
   counts, outcome summaries and evidence-quality flags per approach — never raw records. The same
   underlying aggregation (`_build_network_snapshot`) is also exposed deterministically via
   `GET /api/ideas/37/network/{patient_id}` for the network map and cohort landscape.
3. The agent renders the result as `summary`, `evidence` and `alert` blocks, always surfacing the
   evidence flags rather than hiding them.
4. `prepare_outcome_feedback` can draft a feedback entry once the oncologist has decided, but the
   entry is only shown as a proposal.

## Inputs
The synthetic patient record and the simulated network cohort (`sample-data/eu_network/`).

## Outputs
A grouped view of comparable-patient treatment approaches and outcomes, evidence-quality alerts,
and (once confirmed by a human) a feedback entry appended to the in-memory simulated learning log.

## Human decisions
The oncologist and patient choose the treatment. Recording an outcome into the shared learning
system is a separate, explicit action (`POST /api/ideas/37/feedback`) — nothing the agent drafts is
saved automatically.

## Dependencies
Uses the shared `HospitalShell`, `StoryGuide`/`Backstage` and generative-UI block components; no
other idea depends on this one.

## Major assumptions
A real system would need governed, consented cross-hospital federated queries, data-quality
checks and clinical/data-governance sign-off before any evidence is shared or reused — all
simulated here with synthetic, in-memory data.
