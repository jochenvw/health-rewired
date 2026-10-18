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
reasoning. Ten priority points are shared between treatment-related fatigue, cancer control and a case-specific side-effect concern:
increasing one redistributes the remaining points proportionally between the others, with whole-point
rounding; an empty pair splits the remainder evenly. Presets and reset use the same ten-point budget.
Live bars beside the sliders demonstrate how fit changes immediately.
Budget segments, label swatches and slider tracks share the same colour per priority in both themes.
Additional hair-loss, nausea and hand–foot avoidance switches each add one preference point outside
the ten slider points. Fit combines the slider sum with the selected invented avoidance scores,
divides by ten plus switch count and scales to 100. This is not a contraindication or prediction.
Switch changes clear assistant drafts and invalidate recorded decisions; case changes and reset clear switches.
Side-effect concerns are selectable cards with keyboard-accessible switch semantics and explicit
included/not-included states. “In your own words” accepts up to 1,000 characters of synthetic
discussion context. It is included in immutable snapshots, assistant explanations and decision
receipts, but never scored or used to change outcomes or matching. Edits invalidate drafts/decisions;
reset and patient changes clear it. The assistant treats the text as untrusted input, not instructions.
Three distinct synthetic colon cancer patients have fixed records and concerns: Eva Sommer (68,
neuropathy), Marta Klein (61, hair loss) and Leon Fischer (72, nausea). Select a patient directly
from the Patient dropdown or open their worklist row; selecting a concern no longer changes Eva.
Each record has its own identity, staging, fitness, renal function, MDT summary and discussion factors.
The banner, walkthrough, comparison context, assistant and decision receipt use the selected patient.
The shared outcome placeholders remain unchanged across patients and are not personalised predictions.
Side-effect definitions now expand within Compare options, not in a
separate priorities panel. Outcome cards include simulated week-12 symptom severity; an outcome
dropdown selects survival, recurrence, fatigue, neuropathy, hair loss, nausea or hand–foot plots.
Survival/recurrence samples use years 1, 3 and 5; symptom samples use weeks 4, 12 and 24.
Clinical outcome cards retain bars for five-year survival, recurrence and chemotherapy-related nerve
symptoms. Only week-12 side effects use rounded chips: dark labels, muted grey severity scores and a
small blue diamond marker, following the participant screenshot. Dark mode uses readable light labels
and grey scores. Preference-fit bars and selectable trajectory plots remain unchanged.
Severity is an invented 0–10 illustration, not incidence or a validated scale. Zero chemotherapy
effects do not exclude existing symptoms. Equal curves do not establish equal regimen risks.
Topic selection uses the Bijwerkingen bij kanker side-effect index returned by web search;
direct retrieval was unavailable. Short original definitions link to that index, not unverified deep links.
Regimen-specific advice, frequencies and differences remain unverified. Hair-loss and nausea
fit assumptions are equal between the chemotherapy choices; this does not establish equal clinical risk.
Labels and transparent
invented option-fit scores follow the patient's fixed concern; medical placeholder figures do not. Changing patient
resets priorities, draft, choice and note so the previous scenario is not accidentally recorded.
Named snapshots preserve patient ID/name and fixed record context, weights, avoidance switches, factor labels,
fit scores, option labels and country. Saved snapshots remain explicitly patient-labelled when switching;
cross-patient snapshots are not personal outcome comparisons.
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
Three synthetic stage III colon cancer records, unverified teaching summaries, source
links, patient priorities, selected patient and country. The API accepts validated `patient_id`;
legacy `case_id` requests map to the corresponding fixed patient record. When supplied, patient ID
determines the profile. “Patients like me” uses invented European
records filtered by age within five years, stage III and any tied highest-rated priority. No priorities
means no matches in the compatible API; the UI always allocates ten points.
Only Eva's neuropathy profile has compatible observational examples. Marta and Leon
explicitly show no compatible records rather than relabelling neuropathy examples.
Each comparable record shows age distance and top-priority/stage selection matches, plus inspected
diagnosis, sex, pTNM, MMR, ECOG and renal function alongside the selected patient's values, labelled Matches, Differs
or Unknown. These additional synthetic characteristics are not selection filters; avoidance switches
were not recorded in the cohort and are not claimed to match.
Each visible case shows a similarity percentage and matched/known count, with unknown coverage.
The equal-weight demonstration uses the three selection matches (age within five years, stage III,
any shared top slider priority) plus exact matches for the six inspected clinical characteristics.
Similarity is matching checks divided by known checks, rounded to a percentage; unknown values
are excluded rather than treated as matches. Each case expands to show the calculation and
matching/differing/unknown characteristics. Avoidance switches, free text, treatments and outcomes
are not scored. This does not change case selection or imply treatment suitability, predicted
outcomes or a validated clinical similarity measure.

## Outputs
Focused sections: worklist → visual outcomes → priorities → Patients like me → decision.
Outcome bars and selectable line plots replace dense comparison prose; explanations and sources expand
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
Per participant feedback in PR comment 6036805456, issue-local styling follows the supplied
Enrollment Match reference: warm greys, vermilion accents, square geometry, bold sans-serif headings
and structural divider lines. It retains HospitalShell behaviour and labelled Light/Dark controls;
shared shell styles and other ideas are unchanged. Typography uses a local Archivo/Arial/system
fallback stack without adding font assets or external font requests. Dark mode adapts the same palette.

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
