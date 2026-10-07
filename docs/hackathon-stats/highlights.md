# Oncology Hackathon 2026 Munich: what AI agents built

_2 days, 06 Oct – 07 Oct 2026, 15:05. Source: GitHub activity on `jochenvw/health-rewired`. All patient data is synthetic._

## In one line

People described **12 oncology ideas** in plain language. AI agents turned **11** of them into working, clickable software: a median of **25 min** from idea to running prototype, then a new running version **9 min** after each piece of clinical feedback.

## The numbers

| | |
|---|---|
| **12 → 11** | ideas submitted → working prototypes |
| **25 min** | median idea → running prototype (fastest 16 min) |
| **1 min** | until an AI coach replies to a new idea |
| **11 s** | until an agent picks up a clinician's comment |
| **9 min** | from feedback to a new running version |
| **51** | versions shipped across 14 prototypes |
| **25,969** | lines of code written by the coding agent |
| **7** | AI agents working at the same time, at peak |
| **10 h** | of cumulative agent work |

## How an idea became software

1. **Describe.** A clinician or researcher writes the idea as a GitHub issue. No code, no specification.
2. **Coach.** An AI idea coach answers within 1 min, sharpens the clinical question, checks scope and proposes what to build (median 3 min to an approved build plan).
3. **Build.** A coding agent writes the prototype, its synthetic patient data and its tests. Each version is built, tested and deployed as a live preview.
4. **Critique.** A critic agent reviews new builds against the clinical intent (16 reviews).
5. **Iterate.** The participant comments; an agent picks it up within seconds and the next version is live 9 min later.

## Iterating with clinicians

A sprint team ships one version every few weeks. Here, consecutive versions were **21 min** apart.

| Prototype | Versions after feedback | Median feedback → new version |
|---|---|---|
| #104 Add post-MDT shared decision-making prototype | 11 | 7 min |
| #74 Prepare colorectal MDT cases before the meeting | 11 | 10 min |
| #78 Add evidence-based trial screening within the patient chart | 8 | 18 min |

## Who took part

- **6 clinicians and researchers**, supported by 4 organisers.
- 1 created a GitHub account specifically for the event.
- 12 ideas from 5 people; 5 ideas were shaped by more than one person.

## What this would traditionally take

- **Cadence:** 51 versions at one per 3-week sprint = **153 sprint-weeks** (~2.9 team-years).
- **Effort:** 23,517 lines of application code ≈ **118–470 developer-days** at 50–200 lines a day.

Both are rough heuristics. They leave out clinical alignment, design and review, which still need people.

## Under the hood

- **Models:** coding agent gpt-6.1-sol, gpt-6-luna, claude-haiku-4.5; AI coaches claude-sonnet-5.5; safety check on every coach answer claude-haiku-4.5.
- **Scale:** ~268.8 M tokens processed; 51 versions; 85 preview deployments.
- **Cost of all AI coaching:** 740 AI credits ≈ **$7.40** for 48 coach runs.
- **Data:** synthetic patients only; no real patient data.

## Fine print

- Counts activity from 2026-10-06; earlier activity was organiser testing.
- Agent hours overlap: agents run in parallel. They are not saved human hours.
- Coding-agent cost is not reported in its logs; token counts include re-sent cached context.
- Prototypes are previews for discussion, not clinical software.
- Full method and per-metric detail: [`report.md`](report.md). Regenerate with `python scripts/hackathon-stats/collect_stats.py`.
