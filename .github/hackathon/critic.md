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
- The prototype disclaimer or the synthetic-data rule is missing.
- The capability manifest is missing.

Visual design, layout, palette, component choice, theming, motion and storytelling presentation
are entirely up to the builder for each idea. `design-language.md` is optional inspiration, not a
requirement — do not ask for another iteration because an idea looks different from `HospitalShell`,
skips a `Light`/`Dark` toggle, doesn't use `StoryGuide`/`Backstage`, or takes any other visual
approach. Only raise a UI point if it actually breaks the demo (e.g. the idea is genuinely
unusable or unreadable), not for stylistic preference.

## Output

A short comment on the pull request:

1. **Preserved well** – one to three bullets.
2. **Drifted from the idea** – at most three bullets, most important first. Be concrete: what the
   proposal promised and what is there instead.
3. **Verdict** – either "The idea is preserved." or "Worth one more iteration."

Only ask for another iteration when at least one drift is material to the demo. The critic may ask
the coding agent for **one** fix round per pull request; after that it only comments.
