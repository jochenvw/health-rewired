# Hackathon stats

Rerunnable recipe for the "what the agents did" numbers.

```bash
python scripts/hackathon-stats/collect_stats.py
```

Only activity from **6 October 2026** is counted; everything earlier was organiser testing. Override
with `--event-start YYYY-MM-DD`. Agent sessions before that date are ignored, so version numbers
start on 6 October.

Requires authenticated `gh` (with the `gh aw` extension for AI coach token usage) and `git`, using only the Python standard library. Output goes to
`docs/hackathon-stats/`: `highlights.md` is the audience version for clinicians and researchers;
`report.md` contains every metric with method notes; `snapshot.json` contains all metrics,
per-idea journeys and per-hour series for charts.

Job timings for completed runs are cached in `.cache/`, so reruns are fast.

## Sources

| Metric | Source |
|---|---|
| Ideas, outcomes, idea → coach → `ready-for-build` → `preview-ready` | Issues labelled `idea` and their timeline label events |
| Coding-agent build and revision sessions | Actions runs under `dynamic/copilot-swe-agent` (`Running Copilot…` / `Addressing comment on PR #N`) |
| AI coach runs | GitHub Agentic Workflows (`*.lock.yml`) |
| Agent hours, peak concurrency | Job `started_at`/`completed_at` per run |
| Lines, commits, previews | Coding-agent pull requests (GraphQL) and successful `Deploy` runs triggered by pull requests |
| Conversation | Issue and pull-request comments, split by bot and human accounts |
| Iteration speed | Each agent session on a PR is one version. Its version is ready when the preview deploy finishes. Feedback latency is measured from the latest human comment on the PR or idea issue since the previous session started. |
| Participation | Issue authors and commenters in the window, split into participants, organisers (`--organisers`, comma-separated logins) and agents. New account = GitHub account created within 30 days before the event. Pickup = seconds from a participant comment to the next agent comment in the same thread. |
| Models and tokens | Coding agent: `[cca-engine] assistant.usage` lines in each run log (model, input incl. cached prompt, output; no credits). AI coaches: `gh aw logs` usage artifacts, split into the coach and its threat-detection pass, with AI credits (1 credit = USD 0.01). Both cached in `.cache/` because Actions logs expire. Exact premium-request billing by model needs `gh auth refresh -s user` and the billing API; not used. |

## Traditional-delivery heuristic

These are estimates, not measurements. Adjust them with flags:

- `--sprint-weeks 3`: one version per sprint, so versions × sprint weeks gives an equivalent calendar time.
- `--loc-per-dev-day 100`: agent-written `.py`, `.ts`, `.tsx` and `.css` lines, excluding synthetic-data files, divided by lines per developer-day. The report shows a range from half to double this value.
