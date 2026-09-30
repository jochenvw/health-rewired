---
issue: 48
title: "Confirm the tumour board data once, use it everywhere"
users: [coordinator, oncologist, researcher]
capabilities: [structured-extraction, retrieval-evidence-grounding, human-in-the-loop, tool-use, generative-ui]
ui_surfaces: ["/#/idea/48 – MDT coordinator workspace: worklist, minimal dataset review, source-document inspection drawer, MDT/registry/research reuse, scorecard"]
api_endpoints: ["GET /api/ideas/48/dataset/{patient_id}", "POST /api/ideas/48/scorecard", "POST /api/ideas/48/agent"]
agent_tools: ["get_minimal_dataset"]
data: ["sample-data/mdt-minimal-dataset/P-048.json"]
depends_on: []
---

# Confirm the tumour board data once, use it everywhere

## Problem addressed
Stage, performance status, molecular results and prior treatment sit in free text, in several
languages, and are retyped for the MDT, the cancer registry and every study.

## Users
The MDT coordinator or nurse specialist preparing a tumour board; the oncologist confirming the
values; later the registration officer and the researcher who reuse them.

## Capability
One patient with metastatic colorectal cancer whose documents come from four fictional hospitals in
Dutch, French, German and Italian. The minimal dataset is filled from those documents, each value
showing its source sentence, a translation, a confidence and shared codes (TNM, SNOMED CT, OMOP).
Contradictions and missing values are listed first. Confirmed values flow into the MDT overview,
the registration draft and the research export, and a scorecard compares them to a hidden key.

## Agent behaviour
`get_minimal_dataset` returns the documents and extracted values (without the answer key); the
agent explains flagged values with quote + translation, never fills a gap, and ends with an
`actions` block of what the clinician must decide. Without a Copilot token the same dataset is
explained deterministically.

## Inputs
`sample-data/mdt-minimal-dataset/P-048.json` (synthetic documents, extracted values, answer key)
and the clinician's accept / correct / mark-unknown decisions.

## Outputs
Dataset review screen with evidence cards, MDT overview, cancer registration draft, research
export, and a scorecard (correct / correctly left unknown / wrong).

## Human decisions
Every value is accepted, corrected or marked unknown by a human before it appears anywhere else;
unconfirmed values are visibly excluded from registration and research.

## Dependencies
An issue-local workspace shell (`frontend/src/ideas/issue-48/Workspace.tsx` + `design.css`) built on
the shared design language in `.github/hackathon/design-language.md`, plus `StoryGuide`/`Backstage`,
the shared generative-UI blocks and `app.agent.run_agent`.

## Major assumptions
Real deployments would read documents from several hospital systems, and the registry would apply
its own validation before intake.
