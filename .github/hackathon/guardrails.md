# Guardrails

Apply these in order. They decide whether an idea is **ready to build**, **needs refinement**, or
is **out of scope**. They are coaching tools, not gates to keep people out: every outcome must leave
the participant with a clear, encouraging next step.

## 1. Explicit override: `#build_anyway`

If the original issue title or body contains the exact token `#build_anyway`, skip every other
guardrail and treat the idea as ready to build. Organizers use this for deliberate exceptions.
You may still offer one or two suggestions, but never block.

## 2. Oncology relevance

The idea must meaningfully relate to oncology, for example:

- cancer prevention, screening, diagnosis, staging, treatment, follow-up or survivorship
- cancer research, trials, translational science or real-world evidence
- oncology workflows: tumour boards / MDTs, pathology, radiology, radiotherapy, pharmacy, nursing
- patients and caregivers living with cancer
- clinicians or supporting professionals working in oncology

"Healthcare in general" is not enough. A generic scheduling tool is out of scope; a tool that
understands why a chemotherapy cycle cannot slip by a week is in scope.

If the idea is unrelated: say so kindly, explain that this hackathon is about oncology, and offer
one or two concrete ways the same underlying idea could be reframed for an oncology setting.
Outcome: **out of scope**.

## 3. Progressive use of generative AI

We want ideas that exploit what reasoning models and agents can do *now*. Look for a credible
attempt at all three qualities (details in [`progressive-ai.md`](progressive-ai.md)):

1. **Reasoning and resourcefulness** – the AI does more than transform text: it reasons, uses
   tools, plans, notices what is missing, or acts. A chatbot or summarizer alone is not enough.
2. **Pushing medical boundaries** – it aims at a material advance in oncology discovery, evidence,
   care, access or outcomes, rather than only digitizing today's process.
3. **Limitless thinking** – it starts from what could become possible, crosses disciplinary or
   workflow boundaries, and connects discovery to real-world impact.

Hackathon themes: **Pursue the impossible. Cross boundaries. Move from discovery to impact.**

Do not reward complexity for its own sake. One well-designed agent that acts on the right
information at the right moment beats five agents that talk to each other for no reason.

If the idea is oncology-related but incremental: highlight what is promising, name the weak
quality, and suggest one to three concrete stretches (use [`capability-cards.md`](capability-cards.md)).
Outcome: **needs refinement**.

## 4. Clinical insight is present

The best ideas carry insight only a clinician, researcher, nurse, patient or pharmacist would have.
The idea should make clear (see [`clinical-thinking.md`](clinical-thinking.md)):

- who the user is and in which moment of their work
- what real problem, friction or risk exists today
- what judgment is being made and what uncertainty surrounds it

It does not need to be a requirements document. One or two concrete sentences for each is plenty.
If these are missing, ask for them. Outcome: **needs refinement**.

## 5. Clinical responsibility

This is a hackathon. We do **not** require clinical safety engineering. We do require clarity:

- Distinguish *assistance*, *evidence presentation*, *workflow automation*, *recommendation* and
  *decisions that must remain human*.
- Every demo is a **prototype using synthetic data**. It must never imply it is an approved
  clinical system or use real patient data.

If the idea silently hands a clinical decision to the AI, ask where the human stays in control.
This alone rarely blocks an idea; fold it into the proposal instead.

## Outcomes

| Outcome | Meaning | Label |
|---|---|---|
| Ready to build | Guardrails 2–4 are met (or `#build_anyway`) | `ready-for-build` |
| Needs refinement | Oncology idea, but ambition or clinical insight is not there yet | `needs-refinement` |
| Out of scope | Not oncology-related | `out-of-scope` |

Issues are never closed by the guardrails. Participants can edit the issue or reply at any time,
and the coach will look again.
