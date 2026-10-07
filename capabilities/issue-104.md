---
issue: 104
title: "Post-MDT shared decision making"
users: [oncologist, patient, nurse]
capabilities: [tool-use, generative-ui, human-in-the-loop]
ui_surfaces: ["/#/idea/104"]
api_endpoints: ["POST /api/ideas/104/explain"]
agent_tools: ["read_shared_decision_context"]
data: ["sample-data/issue-104.json"]
depends_on: []
---

# Post-MDT shared decision making

## Problem addressed
Patients and clinicians need to compare colon cancer treatment trade-offs after the tumour board,
especially when there is no single clear-cut option.

## Users
The patient, clinician and optionally caregiver in the post-MDT consultation.

## Capability
A guided worklist-to-decision walkthrough compares three synthetic choices, including no additional
chemotherapy with follow-up (“No treatment / Do nothing”). Germany, Italy
and Netherlands selectors change teaching wording and guideline source pointers. Linked sliders
change preference fit, never the medical risk numbers. Every consequential element has expandable
reasoning. Ten priority points are shared between quality of life, survival benefit and walking:
increasing one redistributes the remaining points proportionally between the others, with whole-point
rounding; an empty pair splits the remainder evenly. Presets and reset use the same ten-point budget.
Live bars beside the sliders demonstrate how fit changes immediately.
Three alternative synthetic Eva case examples adapt the factors: foot tingling and partner care,
restricted shoulder movement and self-care, or childcare and transport support. Labels and transparent
invented option-fit scores change with the case; medical placeholder figures do not. Changing case
resets priorities, draft, choice and note so the previous scenario is not accidentally recorded.
Named snapshots preserve weights, factor labels, fit scores, option labels, country and case context.
Multiple saved combinations sit beside the live combination; slider edits never mutate saved
snapshots. Remove individual snapshots as needed. Snapshots persist only during the current visit,
not after leaving/reloading; saving is not a treatment decision.
Clinical outcomes stay separate and fixed. Guideline/trial pointers, an explicitly unconnected
prediction-model module and observational examples have separate provenance and limitations.
Plain-language definitions and an assistant explanation support the conversation.

## Agent behaviour
The shared Copilot SDK runner uses a read-only consultation tool and renders summary/evidence
blocks. Without credentials, an issue-specific deterministic explanation keeps the walkthrough usable.
Neither mode retrieves full guidelines, calculates a validated personal risk or chooses treatment.

## Inputs
A synthetic 68-year-old stage III colon cancer scenario, unverified teaching summaries, source
links, patient priorities, case example and selected country. “Patients like me” uses invented European
records filtered by age within five years, stage III and any tied highest-rated priority. No priorities
means no matches in the compatible API; the UI always allocates ten points.
Only the foot-tingling case has compatible observational examples. Shoulder and caregiving cases
explicitly show no compatible records rather than relabelling walking examples.

## Outputs
Focused sections: worklist → visual outcomes → priorities → Patients like me → decision.
Outcome bars and fatigue line plots replace dense comparison prose; explanations and sources expand
on demand. Generated explanation blocks and a local receipt of the joint decision or deferral. The
learning-loop preview captures the selected option, preferences, context and evidence limitations.

## Human decisions
The patient and clinician choose or defer treatment, edit the conversation note and explicitly confirm
review before recording. Separate consent is required for the simulated learning-loop contribution.
Edits invalidate the receipt and contribution. No automatic choice, transmission, training, persistence
or EHR write-back.

## Dependencies
Existing HospitalShell, StoryGuide, Backstage, generated block registry and shared Copilot runner.
No new dependencies or infrastructure.

## Major assumptions
All summaries, risks, preference scores and trajectories are invented teaching material, not
guideline-derived evidence or validated predictions. National guideline texts remain unverified;
no country-specific efficacy differences are claimed. Costs are unavailable.
Per participant feedback in PR comment 6036045255, this idea shows the future demonstration only:
the horizon selector and six-month coverage are removed locally, without changing shared policy or
other ideas. The explanation API retains its existing horizon parameter for compatibility; this UI
always requests `future`. Real predictions and learning-loop linkage would require richer records,
validated models, consent and governance. No clinical confidence algorithm
or evidence-based best option is claimed. Observational examples are not causal comparisons.
