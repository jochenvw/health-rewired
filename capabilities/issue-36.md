---
issue: 36
title: "Cancer digital twin: compare next treatment paths"
users: [oncologist, patient]
capabilities: [agentic-workflows, retrieval-and-evidence-grounding, generative-ui, human-in-the-loop-workflows]
ui_surfaces: ["/idea/36"]
api_endpoints: ["GET /api/ideas/36/twin/{patient_id}", "POST /api/ideas/36/ask"]
agent_tools: ["find_comparable_patients", "get_patient", "list_sample_data", "read_sample_data"]
data: ["sample-data/patients/P-004.json", "sample-data/comparable_patients.csv", "sample-data/trials.csv"]
depends_on: []
---

# Cancer digital twin

## Problem addressed
After progression, an oncologist and patient must weigh treatment paths with incomplete evidence
about response, toxicity, and what the next decision will look like.

## Users
An oncologist and patient (Maria López, synthetic NSCLC case) discussing the next treatment after
a scan shows oligoprogression on first-line osimertinib, with comorbidities (CKD) complicating the
standard path.

## Capability
A continuously updated digital twin simulates three next-treatment paths - switch chemotherapy,
continue targeted therapy plus local therapy, or enrol in a molecular-matched trial - each shown
as a trajectory of simulated response, progression risk and toxicity, grounded in comparable
synthetic patients and trial data, with the single future test that would most reduce uncertainty
between them.

## Agent behaviour
- A deterministic simulation engine (`backend/app/ideas/issue_36.py: simulate_paths`) builds the
  three trajectories and names the most informative future test.
- The Copilot SDK agent (`POST /api/ideas/36/ask`) answers follow-up questions, using the
  `find_comparable_patients` tool (plus the shared `get_patient`/sample-data tools) to ground
  assumptions in the synthetic comparable-patient cohort, and renders the answer as UI blocks.

## Inputs
`sample-data/patients/P-004.json` (Maria López's record), `sample-data/comparable_patients.csv`
(synthetic cohort of similar cases and outcomes), `sample-data/trials.csv` (trial SYN-LU-310).

## Outputs
Three path cards (trajectory bars, assumptions, evidence), a callout naming the most informative
future test, and generative-UI blocks (evidence/alert/actions) from the assistant's answers.

## Human decisions
The clinician (with the patient) chooses one path via an explicit radio selection and records it
with an optional note; nothing is filed to the chart until "Record decision for next visit" is
clicked. Ordering the suggested test is a separate explicit action. The assistant only grounds and
explains - it never proposes a decision.

## Dependencies
None beyond the shared starter platform (`HospitalShell`, `Story`, generative-UI blocks, agent
runner).

## Major assumptions
The simulated trajectories are illustrative numbers for the demo, not modelled from real outcome
data; a real system would need validated response/toxicity models and a much larger comparable-
patient registry.
