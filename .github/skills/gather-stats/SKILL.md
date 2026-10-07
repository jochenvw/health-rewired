---
name: gather-stats
description: Gather the latest Oncology Hackathon stats on what AI agents did (ideas → prototypes, iteration speed, participation, models, tokens, cost) and write an audience-ready Markdown summary. Use when asked for hackathon stats, numbers, metrics, a scoreboard, "what did the agents do", or an update to docs/hackathon-stats.
---

# Gather hackathon stats

Regenerate the numbers that show agentic acceleration during the hackathon, then present them to
clinicians and researchers.

## Run

From the repository root (requires authenticated `gh` with the `gh aw` extension, and `git`;
Python standard library only):

```bash
python scripts/hackathon-stats/collect_stats.py
```

Takes a few minutes on the first run; job timings and agent logs are cached in
`scripts/hackathon-stats/.cache/` (gitignored), so reruns are fast.

Useful flags:

| Flag | Default | Purpose |
|---|---|---|
| `--event-start` | `2026-10-06` | Ignore earlier activity (organiser testing) |
| `--organisers` | `jochenvw,cammeleon66,marcel-fokker,ybaccouche` | Logins reported as organisers, not participants |
| `--sprint-weeks` | `3` | Heuristic: weeks per version in a sprint cadence |
| `--loc-per-dev-day` | `100` | Heuristic: code lines per developer-day (shown ×0.5–×2) |

## Outputs (`docs/hackathon-stats/`)

| File | Audience |
|---|---|
| `highlights.md` | Clinicians and researchers: story, headline numbers, fine print |
| `report.md` | Organisers: every metric with method notes |
| `snapshot.json` | Charts and follow-up analysis |

## After running

1. Read `highlights.md` and sanity-check it against `report.md`: idea → preview time, feedback →
   new version time, versions, participants, AI coaching cost.
2. Flag anything implausible (for example, durations of hours or days usually mean queued runs or
   human idle time leaked into a metric) before presenting.
3. Report the top numbers tersely; do not overclaim. Agent hours overlap and are not saved human
   hours; the traditional-effort figures are heuristics; prototypes are not clinical software.
4. Commit the refreshed `docs/hackathon-stats/` only when asked.

Method, data sources and heuristics: [`scripts/hackathon-stats/README.md`](../../../scripts/hackathon-stats/README.md).
