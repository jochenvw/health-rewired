---
issue: 55
title: "From a DNA result to a matching trial anywhere in Europe"
users: [oncologist, coordinator]
capabilities: [structured-extraction, retrieval-evidence-grounding, tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/55 – Molecular tumour board preparation (HospitalShell)"]
api_endpoints:
  - "GET /api/ideas/55/case"
  - "POST /api/ideas/55/match"
  - "POST /api/ideas/55/interpret"
  - "POST /api/ideas/55/referral"
agent_tools: ["get_molecular_case", "get_trial_screening", "get_referral_template", "render_ui"]
data:
  - "sample-data/patients/P-004.json"
  - "sample-data/genomics/P-004-wgs-report.md"
  - "sample-data/trials/eu-molecular-trials.json"
  - "sample-data/referrals/referral-package-template.md"
depends_on: []
---

# From a DNA result to a matching trial anywhere in Europe

## Problem addressed
A rare, potentially treatable tumour alteration is found on whole-genome sequencing, but the trial
that fits may run in another country. Eligibility information sits in different systems and
languages, so cross-border options are searched by hand or not at all.

## Users
The oncologist preparing a patient for the molecular tumour board, immediately after the DNA
report arrives.

## Capability
One screen takes the case from DNA report to a reviewable cross-border referral: the alteration is
explained with its evidence tier, European trials are screened criterion by criterion, each
criterion is marked met / not met / unknown with its source, missing values can be added and change
the result immediately, and the referral package is drafted in the receiving centre's language.

## Agent behaviour
`interpret` calls `get_molecular_case` and `get_trial_screening`, explains the ERBB2 (HER2)
amplification, its tier, and what is still missing. `referral` additionally calls
`get_referral_template` and drafts the cover letter, eligibility evidence and approval actions in
the site language. Trial matching itself is deterministic (`evaluate()` in
`backend/app/ideas/issue_55.py`) so the screen always tells the same story; the agent reads that
result rather than inventing eligibility.

## Inputs
Synthetic patient P-004 (metastatic rectosigmoid adenocarcinoma, AYA), her whole-genome sequencing
report, a 12-trial European registry in four languages with fictional drug availability, and any
value the oncologist adds by hand (LVEF from the cardiology echo).

## Outputs
Shortlist of three trials in three countries (one match, one excluded with the failing criterion,
one blocked by an unknown value), a screened-out list with reasons, a per-criterion evidence table
with sources, and a drafted referral package with an actions block.

## Human decisions
The molecular tumour board judges clinical relevance; the oncologist and patient decide whether to
pursue the referral; the receiving trial team decides final eligibility. The package is only
drafted and must be approved explicitly – nothing is sent automatically. Unknown criteria stay
unknown and are never turned into a yes or a no.

## Dependencies
`HospitalShell`, `StoryGuide`/`Backstage`, the shared UI block registry and `run_agent`.

## Major assumptions
That a real deployment would read trial registries and the patient record through interfaces, that
criteria can be mapped to structured facts, and that drug availability and cross-border
authorisation (EU S2) data are retrievable per country.
