# Hackathon policy (Markdown-first)

This folder is the **brain of the hackathon agents**. Every agent in this repository reads it:

| Agent | When it runs | What it reads here |
|---|---|---|
| Idea coach (`.github/workflows/idea-coach.md`) | Issue opened / edited / commented | All files in this folder |
| Copilot coding agent (`.github/copilot-instructions.md`) | Issue assigned to Copilot | `purpose-and-learnings.md`, `guardrails.md`, `implementation-guidelines.md`, `design-language.md`, `capability-cards.md` |
| Post-build critic (`.github/workflows/idea-critic.md`) | Copilot finishes a pull request | `purpose-and-learnings.md`, `critic.md`, `guardrails.md`, `clinical-thinking.md` |
| Architecture coach (`.github/workflows/architecture-coach.md`) | Participant marks a live prototype finished | `architecture-coaching.md`, `purpose-and-learnings.md`, `clinical-thinking.md`, `capability-cards.md` |
| Presentation editor (`.github/workflows/presentation-editor.md`) | Participant replies `/presentation revise` after seeing a deck | `showcase-presentation.md` and the complete issue history |

> **Want to change what the hackathon agent considers a good idea? Edit these Markdown files.**
> No YAML, Python or workflow change is needed. Changes apply on the next agent run after they
> are merged to `main`.

## Files

| File | Purpose |
|---|---|
| [`purpose-and-learnings.md`](purpose-and-learnings.md) | **Read first.** Why the hackathon exists, what a good prototype is, lessons learned |
| [`two-horizons.md`](two-horizons.md) | Every idea in two versions: in six months (minimum dataset, per-hospital readiness) and the moonshot |
| [`guardrails.md`](guardrails.md) | The gate: override token, oncology scope, ambition, clinical insight, responsibility |
| [`progressive-ai.md`](progressive-ai.md) | How to push ideas beyond "LLM = chatbot / summarizer" |
| [`clinical-thinking.md`](clinical-thinking.md) | Questions that pull clinical expertise out of participants |
| [`capability-cards.md`](capability-cards.md) | Evolving vocabulary of modern GenAI capabilities |
| [`coaching.md`](coaching.md) | Tone, response shape, labels and the implementation proposal template |
| [`implementation-guidelines.md`](implementation-guidelines.md) | How the coding agent builds an approved idea |
| [`design-language.md`](design-language.md) | Shared visual and interaction system across all prototypes |
| [`critic.md`](critic.md) | What the post-build critic checks |
| [`architecture-coaching.md`](architecture-coaching.md) | How a finished prototype becomes a future Azure architecture proposal |
| [`showcase-presentation.md`](showcase-presentation.md) | How the final issue history becomes an audience-ready PowerPoint |

## Extending

- **New criterion or principle** → add a section to `guardrails.md`, or add a new `*.md` file
  in this folder. The coach reads *every* Markdown file in this folder.
- **New capability** → add a card to `capability-cards.md` using the same four headings.
- **Change coaching tone or proposal format** → edit `coaching.md`.
- **Change what the critic looks for** → edit `critic.md`.
- **Change the deck story or presentation-revision rules** → edit `showcase-presentation.md`.

Rules of thumb for authors:

1. Write for a reasoning model: explain *why* a rule exists, not only *what* it is.
2. Prefer examples over scoring rubrics. Agents reason semantically; never ask for numeric scores.
3. These are **coaching and quality** controls in a trusted environment, not security controls.
