---
issue: 34
title: "AI European Tumour Board – pre-board analysis"
users: [oncologist, coordinator]
capabilities: [tool-use, multi-agent-debate, generative-ui, human-in-the-loop, retrieval]
ui_surfaces: ["/idea/34"]
api_endpoints: ["POST /api/ideas/34/analyze"]
agent_tools: ["find_similar_patients", "list_sample_data", "read_sample_data", "get_patient"]
data: ["sample-data/patients/P-001.json", "sample-data/patients/P-004.json", "sample-data/notes/P-001-mdt-note.md", "sample-data/notes/guideline-breast-her2-ihc2plus.md", "sample-data/trials.csv"]
depends_on: []
---

# AI European Tumour Board – pre-board analysis

## Problem addressed
The weekly tumour board has limited time; specialists cannot deeply review every complex case, so
contradictions in the evidence (e.g. a pending pathology result that could change the treatment
plan) may surface late, during the meeting rather than before it.

## Users
The MDT coordinator or oncologist preparing a complex case the evening before tumour board.

## Capability
One system prompt convenes exactly six specialist personas (oncologist, radiologist, pathologist,
molecular specialist, trial specialist, real-world-evidence specialist), each stating an initial
hypothesis, evidence and confidence. The agent then names direct challenges between specific
specialists (e.g. molecular specialist challenges oncologist over an overdue ISH result) and
converges the case into a consensus board of agreed / still disputed / missing-before-MDT /
human-decision items, each citing its source.

## Agent behaviour
`run_agent` is called with an idea-specific system prompt (`backend/app/ideas/issue_34.py`) and
one extra tool, `find_similar_patients`, alongside the shared `list_sample_data`, `read_sample_data`
and `get_patient` tools. The agent gathers the patient record, the MDT note, the HER2 IHC2+
guideline extract, `trials.csv` and comparable synthetic patients, then calls `render_ui` with a
single `specialist_debate` block: six specialist views, a challenge round and grouped consensus
items. Without a Copilot token, `_deterministic_debate()` returns a fixed, grounded six-specialist
debate so the signature UI still demos offline.

## Inputs
- `sample-data/patients/P-001.json` (default complex case: luminal B breast cancer, HER2 IHC2+
  pending ISH, diabetic neuropathy affecting taxane dosing).
- `sample-data/patients/P-004.json`: a comparable synthetic patient (same IHC2+ presentation,
  since resolved HER2-negative) used as real-world-evidence.
- `sample-data/notes/P-001-mdt-note.md` and the new `guideline-breast-her2-ihc2plus.md` extract.
- `sample-data/trials.csv`.

## Outputs
A single `specialist_debate` UI block: six `specialists` (role/hypothesis/evidence/confidence/
source), a list of `challenges` (challenger/challenged/contested_evidence/detail/resolved), and
`items` each tagged with a `group` (`agreed` | `disputed` | `missing` | `human_decision`).

## Human decisions
The consensus board's `human_decision` column renders explicit approve/dismiss controls per item;
nothing is decided until the tumour board reviews it. The brief is explicitly framed as a
hypothesis, never a decision. The prototype disclaimer stays visible.

## Dependencies
Shares `HospitalShell`, `StoryGuide`/`Backstage` and `run_agent` with the starter idea; adds one
new block type, `specialist_debate` (`backend/app/agent/ui.py`,
`frontend/src/blocks/SpecialistDebateBlock.tsx`), registered alongside the generic blocks.

## Major assumptions
In a real setting the specialists would be distinct systems/people rather than one agent
persona-switching; guideline and trial matching would query live registries instead of one
synthetic extract and a 6-row CSV.
