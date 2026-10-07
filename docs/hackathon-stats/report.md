# Hackathon in numbers

_Generated 2026-10-07 15:05 (local) from `jochenvw/health-rewired`; activity since 2026-10-06._

## Headline

| Metric | Value |
|---|---|
| Ideas submitted | **12** by 5 people |
| Ideas that reached a running preview | **11** |
| Median idea → first running preview | **25 min** (fastest 16 min) |
| Median idea → first coaching reply | 1 min |
| Median feedback → new running version | **9 min** |
| Versions shipped | **51** (build + revisions) |
| Coding-agent build sessions | **14** |
| Coding-agent revision sessions from feedback | **37** on 9 prototypes |
| AI coach runs | **51** |
| Cumulative agent execution | **10.3 h** |
| Peak agents working simultaneously | **7** (Tue 06 Oct 17:17) |
| Peak coding agents building simultaneously | 6 |
| Lines added by the coding agent | **25,969** (−13) |
| Coding-agent commits / pull requests | 86 / 14 |
| Preview deployments (PR build → test → deploy) | 85 |
| Agent comments | 205 (~19,233 words) vs 135 human |
| Humans involved | 10 |

## Participation

| Metric | Value |
|---|---|
| Participants (excluding organisers) | **6**, of whom 4 submitted an idea; 1 created a GitHub account for the event |
| Organisers / facilitators | 4 |
| Issues opened by participants / organisers / agents | 9 / 6 / 3 |
| Comments by participants / organisers / agents | 13 / 122 / 205 |
| Words by participants / organisers / agents | 884 / 49,639 / 19,233 |
| Agent comments per human comment | 1.5 |
| Participant comment picked up by an agent | **11 s** median (n=13, max 85 s); the revised prototype follows in the feedback → new version time below |
| Ideas discussed by more than one person | 5 |

| Person | Role | Issues | Ideas → preview | Comments | Words | Threads |
|---|---|---|---|---|---|---|
| JanvandenBrand | participant | 6 | 6 → 6 | 2 | 15 | 2 |
| Ferraa96 | participant | 1 | 1 → 0 | 6 | 578 | 2 |
| malay-gaherwar | participant | 1 | 1 → 1 | 1 | 1 | 1 |
| jvdwm (new account) | participant | 1 | 1 → 1 | 1 | 14 | 1 |
| qinghezeng | participant | 0 | 0 → 0 | 2 | 93 | 1 |
| SanddhyaJ | participant | 0 | 0 → 0 | 1 | 183 | 1 |
| jochenvw | organiser | 3 | 0 → 0 | 100 | 43,729 | 57 |
| marcel-fokker (new account) | organiser | 0 | 0 → 0 | 14 | 5,650 | 3 |
| ybaccouche | organiser | 3 | 3 → 3 | 4 | 128 | 2 |
| cammeleon66 | organiser | 0 | 0 → 0 | 4 | 132 | 4 |

## Models and tokens

| Agent | Model | Requests | Input tokens | Output tokens | AI credits (USD) |
|---|---|---|---|---|---|
| Coding agent | gpt-6.1-sol | 1,630 | 141.5 M | 662 k | not reported |
| Coding agent | gpt-6-luna | 790 | 112.7 M | 638 k | not reported |
| Coding agent | claude-haiku-4.5 | 84 | 2.4 M | 37 k | not reported |
| AI coaches | claude-sonnet-5.5 | 198 | 8.7 M | 70 k | 651 ($6.51) |
| AI coaches: safety check | claude-haiku-4.5 | 79 | 2.1 M | 18 k | 89 ($0.89) |

Coding agent: 51 of 51 sessions logged usage; 257.9 M tokens (input includes cached prompt); reasoning effort medium: 51.
AI coaches: 48 runs, 10.9 M tokens, **740 AI credits ≈ $7.40** in total.

## Compute (Actions execution hours, executed runs only)

| Category | Hours |
|---|---|
| ai coach | 2.7 |
| automation | 4.7 |
| coding agent | 7.6 |
| dependabot | 0.0 |

Workflow runs triggered: 1,420; executed (not skipped): 387.

## AI coaches

| Coach | Runs | Minutes |
|---|---|---|
| Presentation editor | 1 | 3 |
| Architecture coach | 3 | 12 |
| Post-build critic | 16 | 64 |
| Idea coach | 31 | 83 |

## Pipeline stage times

| Stage | n | Median | p75 | Fastest |
|---|---|---|---|---|
| Idea → first coaching reply | 12 | 1 min | 2 min | 1 min |
| Idea → ready-for-build | 11 | 3 min | 11 min | 2 min |
| ready-for-build → agent PR opened | 11 | 0 min | 2 min | 0 min |
| Idea → first running preview | 11 | 25 min | 39 min | 16 min |

## Fastest idea → preview

| Issue | Idea | Idea → preview | Lines added |
|---|---|---|---|
| #89 | [Idea] Zero trust for AI agents that touch oncology patient data | 16 min | 525 |
| #90 | [Idea] Automated, instant check whether an agent may use oncology data | 17 min | 823 |
| #92 | [Idea] Patients like me: how were similar patients treated and how did they do? | 18 min | 1,047 |
| #88 | One front door for external requests for oncology data | 20 min | 862 |
| #91 | [Idea] Automated real-world safety monitoring of newly approved cancer treatments | 22 min | 823 |

## Most iterated with clinicians

| Issue | Prototype | Revisions | Median feedback → new version |
|---|---|---|---|
| #104 | Add post-MDT shared decision-making prototype | 11 | 7 min |
| #74 | Prepare colorectal MDT cases before the meeting | 11 | 10 min |
| #78 | Add evidence-based trial screening within the patient chart | 8 | 18 min |
| #100 | Prototype oncology research data-trust review | 2 | 10 min |
| #92 | Add “Patients like me” guided consultation prototype | 1 | 2 min |

## Iteration speed

| Metric | Value |
|---|---|
| Versions shipped (build + revisions) | **51** across 14 prototypes |
| Revisions triggered by humans / by agents (critic) | 36 / 1 |
| Median versions per prototype | 2.0 (max 12) |
| Median human feedback → new running version | **9 min** (p75 14 min, fastest 2 min) |
| Median time between consecutive versions | 21 min |

Feedback → new version, by revision number:

| Revision | n | Median | p75 |
|---|---|---|---|
| 1 | 8 | 11 min | 13 min |
| 2 | 4 | 12 min | 14 min |
| 3 | 3 | 17 min | 50 min |
| 4 | 3 | 13 min | 19 min |
| 5+ | 18 | 9 min | 12 min |

Feedback → new version, by day:

| Day | n | Median | p75 |
|---|---|---|---|
| 2026-10-06 | 3 | 10 min | 13 min |
| 2026-10-07 | 33 | 9 min | 14 min |

## Traditional-delivery comparison (heuristic)

| Lens | Agents | Traditional estimate |
|---|---|---|
| Cadence | 51 versions; median prototype 2.0 versions in 6.0 h | 153 sprint-weeks at one version per 3-week sprint (~2.9 team-years) |
| Effort | 23,517 lines of .py/.ts/.tsx/.css, synthetic-data files excluded | 118–470 developer-days (mid 235, at 50–200 lines/day) |

Heuristic assumptions are flags (`--sprint-weeks`, `--loc-per-dev-day`). Lines per day is a weak proxy: it excludes design, clinical alignment and review.

## Per day

| Day | Ideas | Coding-agent sessions | Coach runs | Agent hours |
|---|---|---|---|---|
| 2026-10-06 | 10 | 18 | 41 | 5.4 |
| 2026-10-07 | 2 | 33 | 10 | 4.8 |

## Platform changes on main

8 commits since 2026-10-06, 4 involving Copilot. Prototypes are not merged: each lives in its own preview pull request.

## Caveats

- Only activity from 2026-10-06 is counted; earlier activity was organiser testing.
- Durations come from job start/end times. Runs that never started a job (for example, waiting for approval) are excluded.
- Agent hours overlap: parallel runs count separately. Do not present them as saved human hours.
- Coding-agent lines include prototypes that stay in their own preview pull request.
- "Human" includes organisers. Journeys cover issues labelled `idea` only.
