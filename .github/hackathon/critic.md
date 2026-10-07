# Post-build critic

The critic asks one question:

> **Did the implementation preserve the interesting idea?**

This is not a code review. Ignore style, naming and minor bugs unless they break the demo.

## Compare

- The issue, and especially the latest "🚀 Implementation proposal" comment
- The pull request description and the changed files
- `capabilities/issue-<N>.md`

## Failure modes to look for

- An ambitious idea became a **generic chatbot** or text box.
- A proposed **tool use** or agent step was omitted or faked with static text.
- **Generative UI** became plain text output.
- The **clinical workflow** or the specific user moment disappeared.
- A **role-specific** experience became generic.
- An important **human decision boundary** disappeared (the AI decides silently).
- The app technically works but **no longer demonstrates the original insight**.
- The idea **does not have its own page** at `/#/idea/<N>` (it was added to the landing page or
  the starter agent instead), or that page does not show the idea's main screen immediately.
  Always material – ask for a fix.
- The page **does not look credible for the participant's role**: a patient-level clinical
  workflow ignores `HospitalShell` without reason; a research/network/operations idea is forced
  into a generic blue EHR despite the proposal; or the result is a chat box, marketing page or
  sparse dashboard with too little synthetic data to picture a real working day.
- The page ignores [`design-language.md`](design-language.md) in a way that hurts the demo: it is
  internally inconsistent, uses color decoratively instead of semantically, hides status or
  uncertainty, or makes consequential output impossible to inspect. A deliberately different
  palette, type or component style for an audience that isn't a clinician at a workstation is fine,
  as long as it is accessible and consistent — only flag this if it actually breaks legibility,
  accessibility or inspectability, not merely for looking different from `HospitalShell`.
- The page does not provide separate, plainly labelled `Light` and `Dark` buttons in a persistent
  top-level area, does not identify the active choice with `aria-pressed`, or leaves parts of the
  walkthrough in the wrong theme.
- The page **does not tell the story**: no guided steps (`StoryGuide`), the mechanism of the
  vision stays invisible (no `Backstage` showing what happens behind the scenes), or a newcomer
  cannot reach the payoff just by following the steps.
- A wait on the AI or a simulated process shows **no visible activity** (no spinner / `Working`
  / running `Backstage`), so a viewer could think it has hung.
- The **six-month horizon** is missing or empty (see [`six-month-horizon.md`](six-month-horizon.md)):
  no `In six months` / `The future` switch, the six-month view does not show which steps are not
  possible yet, or it claims more than the minimal dataset supports.
- The prototype disclaimer or the synthetic-data rule is missing.
- The capability manifest is missing.

## Output

A short comment on the pull request:

1. **Preserved well** – one to three bullets.
2. **Drifted from the idea** – at most three bullets, most important first. Be concrete: what the
   proposal promised and what is there instead.
3. **Verdict** – either "The idea is preserved." or "Worth one more iteration."

Only ask for another iteration when at least one drift is material to the demo. The critic may ask
the coding agent for **one** fix round per pull request; after that it only comments.
