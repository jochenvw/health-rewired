---
issue: 50
title: "Confirm the record once, and it is right everywhere"
users: [coordinator, oncologist, researcher]
capabilities: [tool-use, generative-ui, human-in-the-loop, structured-extraction, evidence-grounding]
ui_surfaces: ["/#/idea/50 – issue-local registry-curation workspace: incoming documents, minimal dataset, MDT overview, registry & research"]
api_endpoints: ["GET /api/ideas/50/case", "POST /api/ideas/50/review"]
agent_tools: ["read_sample_data", "render_ui"]
data: ["sample-data/multilingual/HR-2041-*.md"]
depends_on: []
---

# Confirm the record once, and it is right everywhere

## Problem addressed
Stage, performance status, molecular results and previous treatments exist only as free text, in
several languages, and are retyped for the MDT, the cancer registry and every study. Implicit
wording ("she manages at home") and contradictions between reports are easy to mis-transcribe.

## Users
The MDT coordinator or nurse specialist preparing tomorrow's tumour board, the oncologist
confirming the record, and registry staff and researchers reusing the same values later.

## Capability
One patient screen holds the agreed minimal dataset for a metastatic colorectal cancer patient
whose records arrived from four hospitals in Dutch, French, Italian and German. Each value carries
the original sentence, an English translation, a coding hint (TNM / SNOMED CT / OMOP) and a
confidence indicator. Contradictory, implied and missing values are shown first. Once a value is
confirmed it appears immediately in the MDT overview and the registry / research views.

## Agent behaviour
`POST /api/ideas/50/review` runs the Copilot SDK agent with an idea-specific system prompt. The
agent reads the four multilingual documents with `read_sample_data` and calls `render_ui` once with
alert and evidence blocks describing the KRAS contradiction, the implied ECOG score and the missing
MMR/MSI result, quoting the original sentence for each. Without a token the endpoint returns a
deterministic demo review built from the same dataset.

## Inputs
- `sample-data/multilingual/HR-2041-nl-oncology-note.md` (Dutch outpatient letter)
- `sample-data/multilingual/HR-2041-fr-pathology.md` (French pathology report)
- `sample-data/multilingual/HR-2041-it-radiology.md` (Italian CT report)
- `sample-data/multilingual/HR-2041-de-molecular.md` (German molecular report)
- The clinician's accept / correct / mark-unknown decisions (local state)

## Outputs
Minimal dataset rows with evidence and coding, an MDT overview showing only confirmed values, a
cancer registry draft and an OMOP-style research export with provenance, plus the agent's alert and
evidence blocks.

## Human decisions
Every dataset value is accepted, corrected or marked unknown by a person; nothing reaches the MDT,
registry or research views before that. Releasing confirmed values to the registry is an explicit
button, and the prototype transmits nothing.

## Dependencies
An issue-local workspace shell (`frontend/src/ideas/issue-50/Workspace.tsx` + `workspace.css`) built
on the shared design language tokens, `StoryGuide` / `Backstage`, the shared generative-UI blocks
and `app.agent`.

## Major assumptions
That hospitals can exchange these documents at all, that a minimal dataset is agreed across the
participating sites, and that extraction quality is measured against an answer key before anyone
relies on it (a scorecard over ~20 patients is the next step).
