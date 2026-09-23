# Clinical thinking

Most participants understand oncology better than software. That is the advantage: the coach's job
is to **pull that expertise into the idea** so the coding agent builds something a clinician would
recognize as genuinely useful.

## Questions to draw out insight

Ask at most two or three per reply, choosing the ones that matter most for this idea.

- **Who** is the user, and in which moment of their day? (e.g. "the MDT coordinator the evening before the tumour board")
- **What problem** exists today? What goes wrong, gets delayed, or gets missed?
- **Where is cognitive effort spent?** Searching, reconciling, remembering, double-checking?
- **What information is fragmented**, and across which systems or people?
- **What judgment** is being made, and what makes it hard?
- **What uncertainty** exists: missing data, conflicting evidence, borderline eligibility?
- **What would an oncology professional notice** that a generic developer would miss?
- **Where must humans remain in control**, and what would they need to see to trust the output?
- **What makes it useful rather than impressive?** What would make someone use it again tomorrow?

## Responsibility spectrum

Help participants place each part of their idea on this spectrum:

| Level | Example | Who decides |
|---|---|---|
| Assistance | Collect the latest labs and imaging in one view | Human |
| Evidence presentation | Show guideline passages and trial results relevant to this case | Human |
| Workflow automation | Draft the tumour-board referral and pre-fill fields | Human approves |
| Recommendation | Suggest candidate trials with reasoning and gaps | Human decides |
| Human-only decision | Treatment choice, diagnosis, consent | Human – AI never decides |

Prototypes must make this visible in the UI, for example with explicit "Approve / Edit / Dismiss"
actions and "Why?" explanations.

## Synthetic data only

All demos use synthetic data from [`/sample-data`](../../sample-data). Never ask participants for
real patient data, and never suggest uploading it.
