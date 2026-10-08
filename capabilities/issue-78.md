---
issue: 78
title: "Trials for this patient"
users: [oncologist, coordinator]
capabilities: [tool-use, generative-ui, retrieval-and-evidence-grounding, human-in-the-loop, proactive-agents]
ui_surfaces: ["/#/idea/78"]
api_endpoints: ["GET /api/ideas/78/context", "POST /api/ideas/78/review", "POST /api/ideas/78/handoff"]
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
The decision-first overview opens with compact patient context and a prominent local screening candidate: treatment, design, arms, practical implications, supported criteria and missing information. Detailed chart facts and patient-versus-criterion tables sit behind drill-downs, while intervention summaries and sourced phase/subgroup evidence remain visible on trial cards. Known conflicts stay outside selectable candidates, with failing criteria shown explicitly; missing data does not hide promising options. Only recruiting protocols appear, including in excluded-trial inspection. Up to four potential candidates can be compared. Candidate priority is not a treatment recommendation or confirmation of eligibility.

The persistent Current UI / Enrollment Match control switches between that overview and an attachment-inspired, macOS-style comparison workspace. Enrollment Match places patient characteristics beside trial criteria and opens evidence in a contextual inspector. Both presentations use the same synthetic colorectal record, catalogue, selected candidate, editable drafts, approvals and three-phase journey; changing the UI does not reset clinical work. Light / Dark and both horizons remain available. The attachment's criterion overrides and direct enrolment are deliberately not implemented: missing evidence cannot be marked as met or waived.

In both layouts, an expanded Missing information panel leads every step; missing criteria are highlighted and listed before supported checks. Secondary information is collapsed with an explicit reveal control. Evidence figures, subgroups and prior-phase results carry labelled illustrative synthetic references, never invented real DOIs or registry links. Each protocol shows a synthetic registry identifier and participating centres; the nearest-centre flag and distances are fictional, not measured travel guidance.

MDT view provides a compact, list-only summary of the top one to three options and recorded screening reasons; it does not select or approve a trial. Doctor view retains the complete consultation workflow and persistent next-action controls. View and layout switches preserve shared clinical state. The patient summary exposes the treatment line and prior systemic regimen. Known treatment-naive records conflict with a required prior regimen; unrecorded treatment history stays unknown, never matched.

Every trial shows its drug class, arms and illustrative schedule. Benefit and toxicity symbols are explicitly illustrative dossier/class summaries, not patient predictions or head-to-head efficacy rankings. Unavailable phases and ongoing trials say that no results or subgroup outcomes are available, rather than inventing completed-study results.

## Agent behaviour
The shared Copilot SDK runner reviews the selected horizon-specific candidates, summarises earlier-phase findings and limitations, and drafts an enquiry for each trial. Editable deterministic drafts are available immediately without waiting for AI. A bounded review timeout and issue-specific fallback keep the consultation usable without credentials or when the SDK stalls. Neither mode confirms eligibility or recommends treatment.

The separate participation-email drafting path sends the SDK only a referral pseudonym (REF-078), the selected trial, relevant pathology/molecular/treatment facts and outstanding checks. Patient name, hospital identifier, demographics and raw record sources are excluded; patient-data tools are unavailable in this drafting session. The recipient and subject stay protocol-derived. A 40-second timeout, deterministic email fallback and identity check retain the demo path. Returned drafts must be explicitly applied before replacing clinician edits.

## Inputs
One synthetic patient, five fictional protocols, invented earlier-phase evidence and subgroup outcomes, dated laboratory and report evidence, the minimal colorectal MDT dataset, and clinician notes. Current recruiting phases have no reported outcomes.

## Outputs
Evidence comparison, editable screening enquiry and proposed evidence/order checklist, plain-language patient information packs and local approval receipts. All sending is simulated; nothing is actually ordered, sent or filed.

## Human decisions
The oncologist chooses one candidate or none, reviews an inline prefilled request, then explicitly approves a local screening request or patient-pack sharing simulation. A request is not enrolment or consent. Auto-send is unavailable in this prototype; manual approval remains mandatory. Dismissal and missing-evidence review remain on the same page.

The visible journey is Eligibility → Screening / preparation → Start trial. Approving screening preparation opens step 2; approving its simulated screening request advances to step 3. The clinician can go back; patient-pack approval does not advance the clinical journey. Both layouts retain the same step and state.

In Start trial, acknowledgement reveals “Request participation from the principal investigator”: an editable pseudonymised email to the synthetic site contact, followed by explicit clinician approval and a local simulated-send receipt. Missing evidence does not prevent requesting assessment, but stays unresolved and blocks actual eligibility/enrolment. Trial onboarding is handled by the trial site (out of scope). No simulated request establishes clinical eligibility, consent or enrolment, and no email is actually sent.

Screening examinations include standard checks and labelled study-specific assessments. A study-specific test request requires a separate informed-consent gate; all test actions remain local simulations. Referral preparation can inspect a synthetic institute/site agreement record. When no agreement exists, the prototype supplies an institutional agreement email and a minimal pseudonymised referral letter for clinician editing and simulated signature/sending. Simulated requests do not establish an agreement or inclusion. Trial inclusion name/date remain unconfirmed/unrecorded because the trial site has not validated inclusion.

## Dependencies
HospitalShell with issue-local single-page presentation, a compact guided storyline, Backstage, the shared SDK runner, existing UI blocks and file-based sample data. No new services or libraries.

## Major assumptions
All protocols, recruitment statuses and clinical evidence are fictional, assessed against the fixed synthetic snapshot date. Criteria are illustrative, not complete protocols. Experimental options are study descriptions, not patient-specific treatment recommendations.

DEMO-A/B/C/D/E treatment names, arms and visit descriptions are fictional examples, not real regimens or dosing instructions.

Prior-phase counts and subgroup responses are invented demonstration data, not published findings. Different cohorts cannot be ranked by response rates as if they were head-to-head trials. Candidate order prioritises local access and recorded criterion compatibility, not predicted benefit. Age <75 is specific to one fictional protocol, not a universal restriction; current renal function is missing and must be checked.

The story simulates an EHR launch with an already identified patient. SMART on FHIR is a possible future integration pattern, not a implemented connection. Patient packs describe only recorded history (FOLFOX), uncertainty, risks, alternatives and time for questions; they do not invent surgery or radiation.

In six months, only a local catalogue and mapped minimal-dataset fields are used. Clinic-note performance status and history remain unknown. Molecular and CT findings assume the fictional hospital has started structuring those reports; likely sources are hackathon assumptions. Hospitals must map units and dates, structure reports and maintain a reviewed catalogue.

The future adds a simulated partner catalogue, not live registry retrieval or federated patient queries. Drafts remain session-local in both horizons; refreshing discards them. Patient data stays in the hospital by default; only minimum referral information would leave after clinician approval in a real implementation. Synthetic contact addresses use the reserved `.invalid` domain. Real implementation needs current complete protocols, consent and patient preference review, institutional agreements, and trial-team verification. Existing architecture and presentation artifacts are unchanged by this prototype revision.
