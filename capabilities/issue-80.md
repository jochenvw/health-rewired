---
issue: 80
title: "Reviewed facts to conditional MDT options"
users: [oncologist, coordinator, pharmacist]
capabilities: [tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["Issue 80 preparation workspace"]
api_endpoints: ["GET /api/ideas/80/record", "POST /api/ideas/80/prepare"]
agent_tools: [issue80_reviewed_facts, issue80_retrieve_excerpt, issue80_match_reviewed, render_ui]
data: [sample-data/issue-80/record.json, sample-data/issue-80/guidelines.json]
depends_on: []
---

# Reviewed facts to conditional MDT options

## Problem addressed
Prepare an incomplete synthetic colon-cancer case while keeping unresolved results, source passages,
patient priorities and safety conflicts visible. No actual guideline or treatment advice is supplied.

## Users
An oncologist, pharmacist or coordinator reviewing the case before MDT.

## Capability
GET returns a synthetic record with editable sourced fields and documents. POST accepts
`{horizon: "future" | "six-months", reviewed: boolean, fields: {key: correctedValue}}`.
It returns `{record, recommendations, missing, conflicts, agent}`.

## Agent behaviour
Before review, extraction only: no SDK and empty matching arrays. After review the shared `run_agent`
uses three read-only issue-local tools for effective facts, fictional excerpt retrieval and deterministic
conditional matching, then `render_ui`. A case-specific deterministic demo replaces generic fallback.
Top-level matching remains deterministic even when the SDK is configured.
The runner's backwards-compatible `include_data_tools=False` option excludes shared original-record
tools for this idea: the session can only read the effective facts, excerpts and matching results.
Histology applicability conservatively requires an affirmative adenocarcinoma phrase; negated or
unconfirmed corrections hold the toy pathways for clinician review.

## Inputs
Synthetic cT3N0Mx adenocarcinoma, CT/MMR pending, ECOG 1, neuropathy, historical oxaliplatin
hypersensitivity after fictional prior gastric-cancer treatment, and a hand-function priority.
The eight editable keys are stage, histology, mmr, ct, ecog, comorbidity, allergy and wishes.
Three synthetic document previews demonstrate CSV, Word-style clinic-note text (not a binary DOCX)
and a FHIR-style AllergyIntolerance JSON string. Field sources identify the corresponding preview.
Six-month extraction returns a CSV containing only effective minimal fields, values and sources,
including explicit local-review corrections and unavailable clinic-note fields.

## Outputs
Source-linked hypothetical localized/metastatic options, unresolved branches, conflicts and AgentResult
UI blocks. Mx/pending are not M0/negative; ambiguous MMR remains unresolved.
MMR interpretation accepts only explicit status tokens (such as dMMR / MSI-high or pMMR / MSS).
Negated or arbitrary statements require clarification rather than selecting a positive result.
CT interpretation likewise accepts concise status phrases, not contradictory historical narratives.
Each of the three fictional sources covers the same localized and metastatic questions and shares
the staging caution. Differences are invented illustrative emphases, not claims about real guidelines.
Explicit excerpt branches select pathways; supplemental biomarker/safety cards do not imply that
other sources omit those topics.

## Human decisions
Correct extraction and explicitly review before matching. Confirm staging/biomarkers and reconsider
safety/priority conflicts; no prescribing or write-back occurs.

## Dependencies
Shared agent runner, UI schemas and sample-data helper; no new infrastructure or dependencies.

## Major assumptions
Every excerpt is explicitly fictional, not verified Dutch/Italian/NCCN text. Six-month mode omits
allergy/wishes even if submitted, and replaces source documents with a minimal extract to avoid leaks.
Report-text and clinic fields can be reviewed locally in this demo, not guaranteed structured data.
WHO performance status is a patient / clinic note field and is unavailable in the six-month
feed by default; an explicit local ECOG correction restores it. Histology maps to structured
Morphology; MMR/MSI maps to report-text Non-metastatic CRC: MSI / mCRC: MSI, and CT to report-text
Imaging result (e.g. CT thorax-abdomen).
The missing list preserves absent allergy/preferences as gaps, not evidence of safety.
Hospitals must structure staging, imaging and MMR reports and review performance/comorbidity locally.
