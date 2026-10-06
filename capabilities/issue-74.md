---
issue: 74
title: "MDT cases, ready to review"
users: [oncologist, MDT coordinator, radiologist, pathologist]
capabilities: [agentic-workflows, structured-extraction, retrieval-and-evidence-grounding, persistent-longitudinal-context, role-specific-agents, human-in-the-loop]
ui_surfaces: ["#/idea/74: MDT worklist, patient-at-a-glance, timeline, evidence and gap review"]
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
Prepare the four scheduled patients in parallel, normalize the records into a shared view, assemble dated events, and keep gaps visible beside a concise patient summary.

## Agent behaviour
The GitHub Copilot SDK reads each synthetic patient record through the shared tools and returns generative UI blocks. A deterministic demo remains available without a Copilot token.

## Inputs
Synthetic patient JSON files and the minimal colorectal tumour-board dataset. One Italian outside-hospital MRI PDF is represented by a clearly labelled simulated source card.

## Outputs
An MDT worklist, patient-at-a-glance summary, chronological timeline, source detail, gap list, and specialty-oriented case view.

## Human decisions
Clinicians can accept the preparation, challenge it or send it back. The clinical judgment and MDT decision remain with the team.

## Dependencies
Shared HospitalShell and StoryGuide components, sample-data endpoints, and Copilot SDK agent tools.

## Major assumptions
The sample records and outside-hospital report are fictional. Retrieval, parallel timing, normalization and source availability are demonstrated in a local prototype, not a connected clinical service.
