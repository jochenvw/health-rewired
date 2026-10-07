# Copilot instructions – Oncology Hackathon 2026 Munich (Health Rewired)

This repository is the starter platform for **Oncology Hackathon 2026 – Munich**. Participants are
mostly clinicians and researchers who describe ideas in GitHub Issues; you turn approved ideas into
working, polished prototypes.

The hackathon policy lives in Markdown in [`.github/hackathon/`](hackathon/README.md). Read it
before implementing anything. It overrides generic habits. Start with
[`purpose-and-learnings.md`](hackathon/purpose-and-learnings.md): the goal, what a good prototype
looks like, and mistakes we have already made.

**Goal in one line:** let a non-technical clinician see their idea working inside plain hospital
software, full of fake data, within the hour – told as a guided story that shows how the vision
would work – then iterate.

## Core principles

1. Context: Oncology Hackathon 2026 Munich. Every feature serves an oncology use case.
2. The **GitHub Copilot SDK** (`backend/app/agent/`) must remain central to the app.
3. Use the existing stack (FastAPI + uv, React + TypeScript + Vite, one Docker container) unless there
   is a strong reason not to.
4. Use **synthetic data** from `/sample-data`. Never real patient data.
5. Design, layout and visual style are entirely up to the builder. `HospitalShell` and
   [`design-language.md`](hackathon/design-language.md) are optional inspiration, not requirements.
6. Build demonstrable functionality, not architecture diagrams.
7. Avoid unnecessary infrastructure (no databases, queues, extra services).
8. Preserve the participant's clinical insight – it is the point of the idea.
9. Prefer agentic behaviour (tools, multi-step work, generative UI, human-in-the-loop) over a generic chatbot.
10. Never add complexity merely to appear "agentic".
11. Bias to action: build fast, clickable prototypes that non-technical clinicians can iterate on.
    Security hardening, instrumentation and other non-functional requirements are not a priority.

Detailed build rules: [`.github/hackathon/implementation-guidelines.md`](hackathon/implementation-guidelines.md).
Visual and interaction rules: [`.github/hackathon/design-language.md`](hackathon/design-language.md).

## Before implementing an assigned issue

Ideas are normally gated by the idea coach, which labels the issue `ready-for-build` and posts a
"🚀 Implementation proposal" comment before assigning you. Build that proposal.

If you were assigned an issue **without** the `ready-for-build` label and without the exact token
`#build_anyway` in its title or body, first apply [`.github/hackathon/guardrails.md`](hackathon/guardrails.md).
If the outcome is `out-of-scope` or `needs-refinement`, do not change any files. Instead, update
the body of your WIP pull request with exactly one marker and a feedback section:

```text
<!-- health-rewired-guardrail: OUTCOME issue: #ISSUE_NUMBER -->
```

```markdown
## Guardrail feedback

Constructive feedback for the participant, following .github/hackathon/coaching.md.
```

Replace `OUTCOME` with `out-of-scope` or `needs-refinement`, and `ISSUE_NUMBER` with the issue
number. The `Copilot guardrail handoff` workflow labels the issue, posts the feedback there and
closes the WIP pull request. Never use the marker for an issue that passes the guardrails.

Do not weaken or remove guardrails unless a human repository maintainer explicitly asks for it.

## Validation

From the repository root:

```bash
npm run setup   # uv sync + npm install
npm run lint    # ruff + TypeScript type check
npm test        # backend pytest
npm run build   # frontend production build
```
