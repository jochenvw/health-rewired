---
issue: 78
title: "Trials for this patient"
users: [oncologist, coordinator]
capabilities: [tool-use, generative-ui, retrieval-and-evidence-grounding, human-in-the-loop, proactive-agents]
ui_surfaces: ["/#/idea/78"]
api_endpoints: ["GET /api/ideas/78/context", "POST /api/ideas/78/review"]
agent_tools: ["inspect_trial_screening", "render_ui"]
data: ["sample-data/issue-78-trial-matching.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Trials for this patient

## Problem addressed
Help oncologists notice relevant trials without leaving the patient chart, and see the evidence still needed for screening.

## Users
An oncologist reviewing a colorectal patient after FOLFOX; a trial coordinator receiving a clinician-reviewed enquiry.

## Capability
The decision-first overview opens with compact patient context and a prominent local screening candidate: treatment, design, arms, practical implications, supported criteria and missing information. Detailed chart facts, patient-versus-criterion tables, excluded studies and prior-phase evidence sit behind drill-downs. Known conflicts stay outside selectable candidates; missing data does not hide promising options. Up to four potential candidates can be compared. Candidate priority is not a treatment recommendation or confirmation of eligibility.

## Agent behaviour
The shared Copilot SDK runner reviews the selected horizon-specific candidates, summarises earlier-phase findings and limitations, and drafts an enquiry for each trial. Editable deterministic drafts are available immediately without waiting for AI. A bounded review timeout and issue-specific fallback keep the consultation usable without credentials or when the SDK stalls. Neither mode confirms eligibility or recommends treatment.

## Inputs
One synthetic patient, five fictional protocols, invented earlier-phase evidence and subgroup outcomes, dated laboratory and report evidence, the minimal colorectal MDT dataset, and clinician notes. Current recruiting phases have no reported outcomes.

## Outputs
Evidence comparison, editable screening enquiry and proposed evidence/order checklist, plain-language patient information packs and local approval receipts. All sending is simulated; nothing is actually ordered, sent or filed.

## Human decisions
The oncologist chooses one candidate or none, reviews an inline prefilled request, then explicitly approves a local screening request or patient-pack sharing simulation. A request is not enrolment or consent. Auto-send is unavailable in this prototype; manual approval remains mandatory. Dismissal and missing-evidence review remain on the same page.

The visible journey is Eligibility → Screening / preparation → Start trial. Eligibility shows what is supported and what is missing; screening opens the prefilled enquiry and proposed checks. Start remains unavailable: patient agreement and full trial-team review are prerequisites, not facts created by ticking a box. A local preparation receipt may acknowledge those outstanding requirements, but unresolved eligibility gaps remain blocking and cannot be waived. No simulated request establishes clinical eligibility, consent or enrolment.

## Dependencies
HospitalShell with issue-local single-page presentation, a compact guided storyline, Backstage, the shared SDK runner, existing UI blocks and file-based sample data. No new services or libraries.

## Major assumptions
All protocols, recruitment statuses and clinical evidence are fictional, assessed against the fixed synthetic snapshot date. Criteria are illustrative, not complete protocols. Experimental options are study descriptions, not patient-specific treatment recommendations.

DEMO-A/B/C/D/E treatment names, arms and visit descriptions are fictional examples, not real regimens or dosing instructions.

Prior-phase counts and subgroup responses are invented demonstration data, not published findings. Different cohorts cannot be ranked by response rates as if they were head-to-head trials. Candidate order prioritises local access and recorded criterion compatibility, not predicted benefit. Age <75 is specific to one fictional protocol, not a universal restriction; current renal function is missing and must be checked.

The story simulates an EHR launch with an already identified patient. SMART on FHIR is a possible future integration pattern, not a implemented connection. Patient packs describe only recorded history (FOLFOX), uncertainty, risks, alternatives and time for questions; they do not invent surgery or radiation.

In six months, only a local catalogue and mapped minimal-dataset fields are used. Clinic-note performance status and history remain unknown. Molecular and CT findings assume the fictional hospital has started structuring those reports; likely sources are hackathon assumptions. Hospitals must map units and dates, structure reports and maintain a reviewed catalogue.

The future adds a simulated partner catalogue, not live registry retrieval or federated patient queries. Drafts remain session-local in both horizons; refreshing discards them. Real implementation needs current complete protocols, consent and patient preference review, institutional agreements, and trial-team verification.
