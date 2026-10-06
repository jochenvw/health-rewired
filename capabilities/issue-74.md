---
issue: 74
title: "MDT cases, ready to review"
users: [oncologist, MDT coordinator, radiologist, pathologist]
capabilities: [agentic-workflows, structured-extraction, retrieval-and-evidence-grounding, cross-hospital-identity-matching, evidence-corroboration-and-conflict-review, claim-level-provenance, patient-completeness-assessment, missing-evidence-retrieval, population-derived-next-question-guidance, persistent-longitudinal-context, role-specific-agents, human-in-the-loop]
ui_surfaces: ["#/idea/74: MDT worklist, patient identity matching, patient-at-a-glance, timeline, evidence readiness, source drawer, completeness and retrieval workflow, future-only synthetic cohort guidance"]
api_endpoints: ["POST /api/agent/run", "GET /api/sample-data/patients/{id}.json"]
agent_tools: ["list_sample_data", "get_patient", "render_ui"]
data: ["sample-data/patients/P-003.json", "sample-data/patients/P-004.json", "sample-data/patients/P-005.json", "sample-data/patients/P-010.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# MDT cases, ready to review

## Problem addressed
MDT coordinators and oncologists spend time reconstructing each patient's history from scattered records. This prototype gathers the synthetic case records before the meeting, then shows the timeline, source evidence and open questions.

## Users
The MDT coordinator and oncologist prepare the colorectal tumour board; radiology and pathology views foreground the same case for their specialty.

## Capability
Prepare the four scheduled patients in parallel, compare synthetic cross-hospital identity attributes before linking records, normalize records into one dated timeline, and show evidence states and source paths on each important assertion. Assess whether the available record covers the current MDT question, search available synthetic sources before calling a fact unavailable, and show future-only population patterns as questions to consider—not patient facts or decisions. Conflicts and missing facts remain unresolved until a clinician reviews them.

## Agent behaviour
The GitHub Copilot SDK reads each synthetic patient record through the shared tools and returns generative UI blocks. A deterministic demo remains available without a Copilot token.

## Inputs
Synthetic patient JSON files and the minimal colorectal tumour-board dataset. One Italian outside-hospital MRI PDF is represented by a clearly labelled simulated source card.

## Outputs
An MDT worklist, identity fan-out with verified/probable/review/mismatch outcomes, patient-at-a-glance summary, chronological timeline, evidence readiness counts, contradiction and missing-item cards, clickable citations and synthetic source previews, a question-linked completeness check, simulated retrieval outcomes, and future-only synthetic cohort signals that clinicians can add as discussion questions.

## Human decisions
Clinicians can accept the preparation, challenge it or send it back. The clinical judgment and MDT decision remain with the team.

## Dependencies
Shared HospitalShell and StoryGuide components, sample-data endpoints, and Copilot SDK agent tools.

## Major assumptions
The sample records, identity attributes, independent source excerpts, conflicting KRAS statements, outside-hospital report, retrieval outcomes and European cohort signals are fictional. Identity matching, retrieval, completeness assessment, cohort comparisons, corroboration, contradiction detection and provenance previews are simulated in a local prototype, not a connected clinical service. Population-derived signals never populate patient fields or make a clinical decision.
