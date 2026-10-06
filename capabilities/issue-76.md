---
issue: 76
title: "Guideline recommendations during preparation of the MDT"
users: [oncologist, coordinator]
capabilities: [tool-use, generative-ui, human-in-the-loop, structured-extraction]
ui_surfaces: ["/#/idea/76"]
api_endpoints: ["GET /api/ideas/76/workspace", "POST /api/ideas/76/extract", "POST /api/ideas/76/recommend"]
agent_tools: ["review_colon_mdt_context", "render_ui"]
data: ["sample-data/colon-mdt-guidelines.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Guideline recommendations during preparation of the MDT

## Problem addressed
The preparing physician cannot keep every colon cancer guideline recommendation in mind.
Patient facts, missing diagnostics and personal constraints need to stay visible when comparing options.

## Users
Physicians preparing primary colon cancer cases for the multidisciplinary tumour board.

## Capability
A guided clinical workstation opens on a synthetic patient. The physician triggers extraction,
reviews and corrects facts with record provenance, compares conditional options and approves a
local preparation draft. Three scenarios demonstrate preoperative, postoperative and incomplete
staging records. Light and dark themes cover the full workstation.

## Agent behaviour
The existing Copilot SDK runner calls a read-only issue-local context tool and chooses the order
of supported UI blocks through `render_ui`. Facts and pathway matching are deterministic and bounded
to the synthetic fixture; model-authored claims cannot replace the supplied evidence.
Without SDK credentials, the same workflow runs as a clearly labelled deterministic demo.

## Inputs
Synthetic narrative, CSV-style and FHIR-style record previews; reviewed fact values and statuses;
the future or six-month horizon. File upload, Word parsing and live record retrieval are not implemented.

## Outputs
Primary-treatment discussion options, the facts used, unresolved diagnostic results, allergy and
preference constraints, inspectable guideline reference links and a preparation draft.
The coverage panel derives field membership and likely sources from the actual minimal MDT dataset.

## Human decisions
The physician explicitly confirms reviewed facts, can correct values and statuses, dismiss an option,
add a board question and approve the preparation draft. Treatment decisions remain with the MDT.
Approval is session-local; it does not order treatment or write to a hospital record.

## Dependencies
Shared `HospitalShell`, `StoryGuide`, `Backstage`, UI block registry, sample-data reader and Copilot runner.
No additional dependencies or services.

## Major assumptions
Guideline summaries are illustrative, not independently verified clinical recommendations.
Dutch Richtlijnendatabase, the participant's Italian PDF and NCCN are linked, but full text,
edition, currency and cross-guideline agreement are not verified. Clinical deployment requires
approved source access, edition control and clinician validation.

The six-month demonstration excludes unavailable clinic-note and allergy fields rather than assuming
no conflict. Structured fields can be mapped; report fields still require hospital structuring.
Likely-source coverage is a hackathon assumption, not a hospital readiness measurement.
All records are synthetic; the prototype is not for clinical use.
