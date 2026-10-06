---
issue: 81
title: "Review a new colon case against three illustrative guideline sources"
users: [oncologist, coordinator]
capabilities: [generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/81"]
api_endpoints: ["GET /api/ideas/81/case", "POST /api/ideas/81/prepare"]
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
