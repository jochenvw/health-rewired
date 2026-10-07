---
issue: 81
title: "Review a new colon case against three illustrative guideline sources"
users: [oncologist, coordinator]
capabilities: [generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/81"]
api_endpoints: ["GET /api/ideas/81/case", "POST /api/ideas/81/prepare", "POST /api/ideas/81/discuss"]
agent_tools: [render_ui]
data: ["sample-data/issue-81/*", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Prepare a colon case for human review

## Problem addressed
An MDT clinician needs an inspectable summary of a new primary colon case, with unresolved
diagnostics and patient priorities visible before discussing conditional treatment routes.

## Users
Oncologists and tumour-board coordinators preparing the synthetic case of Elena Fischer, 64, C-081.

## Capability
Extracts six facts from mixed CSV, a Word-letter plain-text export and FHIR-style JSON. After
clinician confirmation, prepares three reproducible, human-only drafts labelled Dutch, Italian
AIOM and NCCN, without asserting actual differences or verified guideline coverage.

## Agent behaviour
The shared Copilot SDK receives only supplied reviewed inputs and curated illustrative examples.
Its `render_ui` blocks supplement the deterministic draft with explanations of conditional routes,
unresolved diagnostics and potential allergy/preference conflicts. An issue-specific fallback
keeps the same reviewable story available without credentials.

## Inputs
Synthetic labs, referral-letter text and staging observations under `sample-data/issue-81/`.
The API accepts an explicit reviewed fact list, including corrections and omissions. It never
refills omitted reviewed facts. No binary DOCX parsing is implemented.

## Outputs
Inspectable sources, provenance-bearing facts, minimal-dataset coverage, three conditional drafts
after review, unresolved CT/MMR expected dates and possible later DPD/pathology requirements.

## Human decisions
Without supplied reviewed facts, preparation returns no recommendations. Clinicians review,
correct and confirm inputs before evaluation; every recommendation remains a human-only draft.
No treatment, antibiotic, filing or prescribing action is performed.

## Shared-decision discussion
`POST /api/ideas/81/discuss` requires `{horizon, facts}` with an explicit reviewed fact list;
omitted or null facts return 422. It reuses the same fact validation and never refills omissions.
Its response contains `limitation`, `eligibility`, `context` and `evidence` findings (label/detail),
`options`, `glossary` entries (term/meaning/timeline/reference), and the shared `agent` result.
Each option has id, title, condition, plain_language, five raw metrics, neuropathy,
six weekly fatigue/visits/recovery story points, and inspectable reasoning.

Two hypothetical localized scenarios illustrate resection alone with follow-up if pathology
permits, and resection followed by adjuvant systemic treatment **only if pathology/MDT indicate**.
Staging, MMR and surgical pathology remain visible eligibility gaps; neither scenario is selectable
as prescribed treatment. Reviewed metastatic staging returns no options and requests specialist MDT
discussion. The plain-language glossary explains resection, adjuvant therapy and tumour MMR/MSI
without reproducing licensed guideline text.

All numbers in `sample-data/issue-81/tradeoffs.json` are arbitrary author-created fixtures:
survival is fictitious people alive at five years per 100, quality is a higher-is-better demo score,
mobility is mock independent mobility per 100, limitations is a lower-is-better mock daily burden,
costs is relative burden (not euros), and neuropathy is fictitious people per 100.
None are personal probabilities, risk models, evidence-derived estimates or real treatment effects.
Priority sliders weight/highlight these raw scores locally and never change the numbers.

Only the future horizon's explicit available ECOG 2–4 activates an arbitrary simulation:
add 10 to daily limitations and every weekly fatigue score, subtract 10 from quality and mobility,
and clamp to 0–100. Survival, neuropathy, costs, visits and recovery text never change.
Six-month mode disables this modifier; missing or pending ECOG never activates it.
Age 64 is recorded but has no calibrated adjustment; comorbidities and inherited genetics
are not recorded. Tumour MMR and CEA come only from reviewed facts, with no numerical
adjustment or biomarker/prognosis inference. The complete recipe is returned with evidence
and option reasoning; personal five-year survival and risk-reduction estimates are explicitly
unavailable, and no validated survival or risk-reduction estimate is offered.

The shared SDK explains grounded JSON using summary/evidence/alert blocks, without changing
numbers, ranking scenarios, recommending or ordering treatment. Meaningful issue-specific blocks
remain available without credentials. Existing guideline URLs are contextual references only;
their content, currency and applicability are unverified and do not support the fixture numbers.

## Dependencies
Shared `app.sample_data`, Copilot runner and existing UI block schema. Coverage derives from actual
minimal-dataset field names and their assumed `likely_source`, not measured hospital readiness.

## Major assumptions
All data are synthetic; illustrative summaries are author-created and unverified, not quotations
or clinical guidance. Original Dutch, Italian attachment and NCCN URLs are inspectable, but their
content, current versions and applicability have not been verified. Real implementation would
require authorized guideline access and clinical validation. dMMR never establishes staging.
Six-month automatic extraction does not infer allergy, wishes or ECOG from full clinic-letter
free text; explicit clinician review can supply those missing facts.
