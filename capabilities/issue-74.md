---
issue: 74
title: "MDT cases, ready to review"
users: [oncologist, MDT coordinator, radiologist, pathologist]
capabilities: [agentic-workflows, structured-extraction, retrieval-and-evidence-grounding, cross-hospital-identity-matching, human-identity-reconciliation, evidence-corroboration-and-conflict-review, claim-level-provenance, human-evidence-verification, persistent-evidence-review, patient-completeness-assessment, missing-evidence-retrieval, population-derived-next-question-guidance, bulk-evidence-review, agentic-evidence-review-and-reconciliation, clinical-search, role-specific-agents, human-in-the-loop]
ui_surfaces: ["#/idea/74: issue-local clinical workspace shell (patient sidebar, Spotlight search, horizon and Light/Dark controls), MDT worklist, identity comparison and review, patient-at-a-glance with MDT context, provenance-linked timeline, evidence readiness and labels, source drawer, conflict reconciliation, persistent verification, completeness and retrieval workflow, review queue with bulk verification, agentic evidence review with per-item progress and reconciliation proposals, verification progress, future-only synthetic cohort guidance"]
api_endpoints: ["POST /api/agent/run", "POST /api/ideas/74/evidence-review", "GET /api/sample-data/patients/{id}.json"]
agent_tools: ["list_sample_data", "get_patient", "submit_evidence_review", "render_ui"]
data: ["sample-data/patients/P-003.json", "sample-data/patients/P-004.json", "sample-data/patients/P-005.json", "sample-data/patients/P-010.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# MDT cases, ready to review

## Problem addressed
MDT coordinators and oncologists spend time reconstructing each patient's history from scattered records. This prototype gathers the synthetic case records before the meeting, then shows the timeline, source evidence and open questions.

## Users
The MDT coordinator and oncologist prepare the colorectal tumour board; radiology and pathology views foreground the same case for their specialty.

## Capability
Prepare all four or one scheduled patient, compare synthetic cross-hospital identity attributes before linking records, and keep uncertain matches separate for clinician review. Normalize evidence into a dated timeline, distinguish source provenance from how sources support or contradict one another, and retain human verification with the evidence and its source set across later preparations. Assess whether the available record covers the current MDT question and search synthetic sources before calling a fact unavailable. Every view builds the same canonical assertion for a fact, so one human verification shows as Verified everywhere it appears. A review queue groups every open item (conflicts, gaps, assistant statements, key facts, timeline events) so routine source checks can be recorded together, while identity matches and conflicts stay individual decisions. Conflicts and missing facts remain open until a clinician records a review outcome. Future-only population patterns are questions to consider—not patient facts or decisions.

## Agent behaviour
The GitHub Copilot SDK reads each synthetic patient record through the shared tools and returns generative UI blocks. An agentic review, verify and reconcile skill is started with one button: it works through every open item in parallel batches, shows per-item progress, compares each claim with its linked source passages and returns review proposals. For source disagreements it proposes a reconciliation (for example, the pathology molecular report over an outside referral letter) with its reasoning. It never records a review or changes source data. A clinician confirms routine proposals together, confirms each reconciliation individually, or keeps any proposal for manual review. A deterministic demo remains available without a Copilot token.

## Inputs
Synthetic patient JSON files and the minimal colorectal tumour-board dataset. One Italian outside-hospital MRI PDF is represented by a clearly labelled simulated source card.

## Outputs
An MDT worklist with first-presentation and follow-up context, single-patient or parallel preparation, identity comparison with an ambiguous review case, patient-at-a-glance summary, dated provenance-linked timeline, explained evidence states, human verification status, side-by-side conflicting sources with rationale-bearing clinician outcomes, persistent review records, missing-item cards and source previews, question-linked completeness, simulated retrieval outcomes, and future-only synthetic cohort signals clinicians can add as discussion questions.

## Human decisions
Clinicians can verify evidence, record a contradiction outcome and rationale, accept the evidence package for MDT review, challenge it or send it back. Accepting preparation does not approve a diagnosis or treatment; clinical judgment and the MDT decision remain with the team.

## Dependencies
An issue-local premium clinical shell (`frontend/src/ideas/issue-74/ui.tsx`) with shared StoryGuide, sample-data endpoints, and Copilot SDK agent tools.

## Major assumptions
The sample records, identity attributes, independent source excerpts, conflicting KRAS statements, outside-hospital report, retrieval outcomes and European cohort signals are fictional. Identity matching, retrieval, completeness assessment, cohort comparisons, corroboration, contradiction detection, source previews and browser-local human review persistence are simulated in a local prototype, not a connected clinical service. Population-derived signals never populate patient fields or make a clinical decision.
