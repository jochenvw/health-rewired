# Capability cards

A living vocabulary of what modern generative AI can do. The coach uses these cards to ask:
**"Could capability X fundamentally improve this idea?"** Suggest at most one to three per reply,
and only where they genuinely change the workflow.

To add a card, copy one below and keep the four headings. Organizers are expected to add cards
during the hackathon.

---

## Tool use

- **What it is:** The model calls functions: search, calculators, databases, APIs.
- **New pattern:** The AI fetches facts and computes rather than guessing from memory.
- **Oncology example:** Calculate a creatinine-adjusted carboplatin dose from the latest lab values and show the working.
- **When not to use:** When a deterministic form or lookup table already answers the question.

## Agentic workflows

- **What it is:** The model plans and executes several steps towards a goal, checking results as it goes.
- **New pattern:** "Prepare this case for the tumour board" instead of "answer this question".
- **Oncology example:** Gather pathology, imaging and history; list open questions; draft the MDT summary for review.
- **When not to use:** When the task is a single step, or every step needs human judgment anyway.

## Multi-agent collaboration

- **What it is:** Several specialised agents with distinct roles critique or complement each other.
- **New pattern:** Built-in second opinion; different perspectives made explicit.
- **Oncology example:** A "radiologist" agent and a "pathologist" agent flag discordance between imaging stage and pathology stage.
- **When not to use:** When one agent with good tools would do. More agents are not more progressive.

## Generative UI

- **What it is:** The AI decides *which interface components* to show (cards, timelines, alerts, forms), not only text.
- **New pattern:** The screen adapts to the case and the role.
- **Oncology example:** For a patient with rising CEA the agent shows a lab trend chart and a "consider re-staging" alert; for a stable patient, a short summary.
- **When not to use:** When a fixed screen is clearer and users need consistency.

## Computer use

- **What it is:** An agent operates software through its user interface like a person would.
- **New pattern:** Automate legacy systems that have no API.
- **Oncology example:** Pre-fill a trial registry screening form from the synthetic record.
- **When not to use:** When an API or file export exists. It is slow and brittle for demos.

## Retrieval and evidence grounding

- **What it is:** Answers are grounded in specific documents, with citations.
- **New pattern:** Trustworthy evidence panels instead of unsupported claims.
- **Oncology example:** Show the exact guideline paragraph and trial result behind each suggested option.
- **When not to use:** When no reliable source material is available in `/sample-data`.

## Long-context reasoning

- **What it is:** The model reads very large inputs (years of notes) in one go.
- **New pattern:** Whole-journey reasoning instead of the last letter only.
- **Oncology example:** Detect that a symptom now reported was already noted two years ago before a recurrence.
- **When not to use:** When the relevant information is small and well structured.

## Structured extraction

- **What it is:** Free text is turned into typed, validated data.
- **New pattern:** Unstructured letters feed downstream logic and UI.
- **Oncology example:** Extract TNM stage, receptor status and ECOG from a pathology report into a structured card.
- **When not to use:** When the data is already structured at the source.

## Multimodal reasoning

- **What it is:** The model reasons over images, tables and text together.
- **New pattern:** Connect what is seen with what is written.
- **Oncology example:** Compare a synthetic imaging report with a sketch or photo of a skin lesion over time.
- **When not to use:** When the demo has no suitable synthetic images; never use real images.

## Human-in-the-loop workflows

- **What it is:** The agent pauses for explicit human approval, edit or rejection.
- **New pattern:** Automation with clear accountability.
- **Oncology example:** Agent drafts the referral; the oncologist approves, edits or dismisses each section.
- **When not to use:** Never skip it for clinical decisions. Avoid it only for trivial, reversible steps.

## Proactive agents

- **What it is:** The agent monitors context and raises issues without being asked.
- **New pattern:** From pull ("ask the system") to push ("the system notices").
- **Oncology example:** Detect that a scheduled scan will miss the window required by a trial protocol and alert the coordinator.
- **When not to use:** When alerts would add noise without a clear action.

## Role-specific agents

- **What it is:** Behaviour, language and UI change with the user's role.
- **New pattern:** One case, different views for oncologist, nurse, pharmacist and patient.
- **Oncology example:** The pharmacist sees interactions and dose checks; the patient sees what happens next week in plain language.
- **When not to use:** When there is only one real user group.

## Persistent / longitudinal context

- **What it is:** The agent remembers across sessions and time points.
- **New pattern:** A companion across the care journey instead of a one-off answer.
- **Oncology example:** Track patient-reported outcomes across cycles and highlight a trend in neuropathy.
- **When not to use:** When a single encounter is the natural scope.
