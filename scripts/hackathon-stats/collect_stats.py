"""Collect agentic-acceleration statistics for the hackathon.

Rerunnable recipe: pulls live data from GitHub (via the `gh` CLI) and git, then writes
`snapshot.json` (metrics + per-hour series, for charts) and `report.md` (headline numbers) to the
output directory. Standard library only.

    python scripts/hackathon-stats/collect_stats.py
    python scripts/hackathon-stats/collect_stats.py --event-start 2026-10-06   # the default
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import statistics
import subprocess
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EVENT_START = "2026-10-06"  # everything before this was organiser testing
ORGANISERS = ["jochenvw", "cammeleon66", "marcel-fokker", "ybaccouche"]
CACHE_FILE = Path(__file__).resolve().parent / ".cache" / "run-durations.json"
CODING_AGENT_PATH = "dynamic/copilot-swe-agent/"
DEPENDABOT_PATH = "dynamic/dependabot/"
COPILOT_LOGINS = {"Copilot", "copilot-swe-agent", "app/copilot-swe-agent", "copilot-swe-agent[bot]"}
CODE_EXTENSIONS = {".py", ".ts", ".tsx", ".css"}
SYNTHETIC_DATA = re.compile(r"data|fixture|mock|sample", re.IGNORECASE)


# ---------- shell helpers ----------


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout


def gh_json(args: list[str]) -> list | dict:
    return json.loads(run(["gh", *args]) or "null")


def gh_paginated(endpoint: str, key: str | None = None) -> list:
    pages = gh_json(["api", endpoint, "--paginate", "--slurp"])
    items: list = []
    for page in pages:
        items.extend(page[key] if key else page)
    return items


def ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def minutes(a: datetime | None, b: datetime | None) -> float | None:
    return round((b - a).total_seconds() / 60, 1) if a and b else None


def summary(values: list[float | None]) -> dict:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return {"n": 0}
    return {
        "n": len(vals),
        "min": vals[0],
        "median": round(statistics.median(vals), 1),
        "p75": round(vals[math.ceil(0.75 * len(vals)) - 1], 1),
        "max": vals[-1],
        "total": round(sum(vals), 1),
    }


def peak_concurrency(intervals: list[tuple[datetime, datetime]]) -> tuple[int, datetime | None]:
    events = [(s, 1) for s, _ in intervals] + [(e, -1) for _, e in intervals]
    current, peak, at = 0, 0, None
    for moment, delta in sorted(events, key=lambda x: (x[0], x[1])):
        current += delta
        if current > peak:
            peak, at = current, moment
    return peak, at


# ---------- collection ----------


def collect_runs(repo: str, now: datetime) -> list[dict]:
    runs = gh_paginated(f"repos/{repo}/actions/runs?per_page=100", "workflow_runs")
    out = []
    for r in runs:
        path = r.get("path") or ""
        if path.startswith(CODING_AGENT_PATH):
            category = "coding_agent"
        elif path.startswith(DEPENDABOT_PATH):
            category = "dependabot"
        elif path.endswith(".lock.yml"):
            category = "ai_coach"  # GitHub Agentic Workflows (gh-aw): an LLM agent runs inside
        else:
            category = "automation"
        name = r["name"]
        if name.startswith(".github/"):  # runs that failed before the workflow name was parsed
            name = Path(name).name.removesuffix(".lock.yml").replace("-", " ").capitalize()
        start = ts(r.get("run_started_at"))
        end = ts(r.get("updated_at")) if r["status"] == "completed" else now
        executed = r.get("conclusion") != "skipped" and start is not None
        out.append(
            {
                "id": r["id"],
                "name": name,
                "event": r["event"],
                "conclusion": r.get("conclusion"),
                "category": category,
                "start": start,
                "end": end,
                "minutes": minutes(start, end) if executed else 0.0,
                "executed": executed,
                "completed": r["status"] == "completed",
                "head_branch": r.get("head_branch"),
            }
        )
    return out


def fetch_durations(repo: str, runs: list[dict], cache_file: Path, now: datetime, since: datetime) -> None:
    """Measure runs from their jobs: compute = sum of job time, interval = first job start → last job end.

    Run-level timestamps include waiting: some runs sat queued for approval for 12 days without a
    job, then were cancelled. Runs without a started job are treated as not executed.
    Completed runs are cached so later reruns only fetch new runs.
    """
    cache: dict[str, list] = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    for r in runs:
        if r["start"] is None or r["start"] < since:
            r["executed"], r["minutes"] = False, 0.0  # testing period
    todo = [r for r in runs if r["executed"] and (str(r["id"]) not in cache or not r["completed"])]
    print(f"Fetching jobs for {len(todo)} runs ({len(cache)} cached) ...", file=sys.stderr)

    def jobs(run_id: int) -> list | None:
        try:
            data = gh_json(["api", f"repos/{repo}/actions/runs/{run_id}/jobs?filter=latest&per_page=100"])
        except SystemExit:
            return None
        return [[j["started_at"], j["completed_at"]] for j in data["jobs"] if j.get("started_at")]

    with ThreadPoolExecutor(max_workers=8) as pool:
        for r, value in zip(todo, pool.map(jobs, [r["id"] for r in todo]), strict=True):
            if value is not None and r["completed"]:
                cache[str(r["id"])] = value
            r["jobs"] = value
    for r in runs:
        if not r["executed"]:
            continue
        spans = [(ts(s), ts(e) or now) for s, e in (r.get("jobs") or cache.get(str(r["id"])) or [])]
        spans = [(s, max(s, e)) for s, e in spans]
        if not spans:
            r["executed"], r["minutes"] = False, 0.0
            continue
        r["minutes"] = round(sum((e - s).total_seconds() for s, e in spans) / 60, 2)
        r["billable_minutes"] = sum(math.ceil(max((e - s).total_seconds() / 60, 0.01)) for s, e in spans)
        r["start"], r["end"] = min(s for s, _ in spans), max(e for _, e in spans)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(cache), encoding="utf-8")


# USD per million tokens: (input, output, cached input). gpt-6.x has no published price; proxies are the
# gpt-5.6 equivalents. Realistic = GitHub Copilot price list; worst case = highest list price seen (OpenAI direct).
MODEL_PRICES = {
    "gpt-6.1-sol": {"realistic": (2.0, 10.0, 0.2), "worst": (5.0, 30.0, 0.5)},
    "gpt-6-luna": {"realistic": (0.2, 1.2, 0.02), "worst": (0.2, 1.2, 0.02)},
    "claude-haiku-4.5": {"realistic": (1.0, 5.0, 0.1), "worst": (1.0, 5.0, 0.1)},
}
UNKNOWN_MODEL_PRICE = (5.0, 30.0, 0.5)
REALISTIC_CACHE_SHARE = 0.9  # coding-agent turns resend ~200k tokens of context; most is a cache hit
ACTIONS_USD_PER_MIN = 0.008  # GitHub-hosted Linux 2-core, private repository, no included minutes


def fetch_azure_cost(repo: str, since: datetime, now: datetime) -> dict:
    """Actual cost of the preview resource group (Azure Cost Management). Requires `az login`."""
    print("Fetching Azure cost ...", file=sys.stderr)
    try:
        variables = {v["name"]: v["value"] for v in gh_json(["variable", "list", "-R", repo, "--json", "name,value"])}
        sub, rg = variables["AZURE_SUBSCRIPTION_ID"], variables["AZURE_RESOURCE_GROUP"]
        body = {
            "type": "ActualCost",
            "timeframe": "Custom",
            "timePeriod": {
                "from": f"{since - timedelta(days=90):%Y-%m-%dT00:00:00Z}",
                "to": f"{now:%Y-%m-%dT23:59:59Z}",
            },
            "dataset": {"granularity": "Daily", "aggregation": {"cost": {"name": "Cost", "function": "Sum"}}},
        }
        body_file = CACHE_FILE.parent / "azure-cost-query.json"
        body_file.parent.mkdir(parents=True, exist_ok=True)
        body_file.write_text(json.dumps(body), encoding="utf-8")
        url = (
            f"https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}"
            "/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
        )
        cmd = [shutil.which("az") or "az", "rest", "--method", "post", "--url", url, "--body", f"@{body_file}"]
        for attempt in range(4):  # Cost Management rate-limits (429) bursts of queries
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if result.returncode == 0:
                break
            time.sleep(15 * (attempt + 1))
        else:
            print(f"Azure cost unavailable: {result.stderr.strip()[:300]}", file=sys.stderr)
            return {"available": False}
        out = json.loads(result.stdout)
    except (SystemExit, KeyError, FileNotFoundError, json.JSONDecodeError):
        return {"available": False}
    cols = [c["name"] for c in out["properties"]["columns"]]
    rows = [dict(zip(cols, r, strict=True)) for r in out["properties"]["rows"]]
    first = min((str(r["UsageDate"]) for r in rows), default=None)
    return {
        "available": True,
        "resource_group": rg,
        "event_usd": round(sum(r["Cost"] for r in rows if str(r["UsageDate"]) >= f"{since:%Y%m%d}"), 2),
        "since_setup_usd": round(sum(r["Cost"] for r in rows), 2),
        "setup_date": f"{first[:4]}-{first[4:6]}-{first[6:]}" if first else None,
    }


def analyse_cost(tokens: dict, billable_minutes: int, azure: dict, prototypes: int, versions: int) -> dict:
    """Realistic and worst-case spend. Worst case: no prompt caching, highest list price, private repository
    without included Actions minutes, and all Azure cost since the environment was set up."""

    def coding_agent(scenario: str, cache_share: float) -> float:
        total = 0.0
        for model, u in tokens["coding_agent"]["by_model"].items():
            p_in, p_out, p_cache = MODEL_PRICES.get(model, {}).get(scenario, UNKNOWN_MODEL_PRICE)
            total += (u["input"] * ((1 - cache_share) * p_in + cache_share * p_cache) + u["output"] * p_out) / 1e6
        return round(total, 2)

    coaches = tokens["ai_coaches"].get("total_usd", 0.0)
    rows = [
        {
            "item": "Coding agent (tokens × list price)",
            "realistic": coding_agent("realistic", REALISTIC_CACHE_SHARE),
            "worst": coding_agent("worst", 0.0),
            "basis": f"Realistic: {REALISTIC_CACHE_SHARE:.0%} of input is cached context, GitHub Copilot price list. "
            "Worst: no caching, highest list price.",
        },
        {
            "item": "AI coaches",
            "realistic": coaches,
            "worst": coaches,
            "basis": "Measured AI credits per request (1 credit = USD 0.01).",
        },
        {
            "item": "GitHub Actions runners",
            "realistic": 0.0,
            "worst": round(billable_minutes * ACTIONS_USD_PER_MIN, 2),
            "basis": f"{billable_minutes:,} billable minutes. Realistic: public repository, free. "
            f"Worst: private, ${ACTIONS_USD_PER_MIN}/min, no included minutes.",
        },
    ]
    if azure.get("available"):
        rows.append(
            {
                "item": "Azure hosting of live previews",
                "realistic": azure["event_usd"],
                "worst": azure["since_setup_usd"],
                "basis": f"Actual cost of `{azure['resource_group']}`. Realistic: event days. "
                f"Worst: everything since setup on {azure['setup_date']}.",
            }
        )
    realistic = round(sum(r["realistic"] for r in rows), 2)
    worst = round(sum(r["worst"] for r in rows), 2)
    return {
        "rows": rows,
        "total": {"realistic": realistic, "worst": worst},
        "per_prototype": {
            "realistic": round(realistic / max(prototypes, 1), 2),
            "worst": round(worst / max(prototypes, 1), 2),
        },
        "per_version": {
            "realistic": round(realistic / max(versions, 1), 2),
            "worst": round(worst / max(versions, 1), 2),
        },
        "azure_available": azure.get("available", False),
    }


def render_cost(s: dict) -> list[str]:
    c = s["cost"]
    return [
        "| Item | Realistic | Worst case | Basis |",
        "|---|---|---|---|",
        *[f"| {r['item']} | ${r['realistic']:,.2f} | ${r['worst']:,.2f} | {r['basis']} |" for r in c["rows"]],
        f"| **Total** | **${c['total']['realistic']:,.2f}** | **${c['total']['worst']:,.2f}** | |",
        f"| Per working prototype | ${c['per_prototype']['realistic']:,.2f} | ${c['per_prototype']['worst']:,.2f} | |",
        f"| Per running version | ${c['per_version']['realistic']:,.2f} | ${c['per_version']['worst']:,.2f} | |",
        "",
        "Not included: Copilot licences, AI calls the running prototypes make, people's time, and platform "
        "setup before the event." + ("" if c["azure_available"] else " Azure cost unavailable (run `az login`)."),
        "",
    ]


USAGE_LINE = re.compile(r"assistant\.usage: model=(\S+) input=(\d+) output=(\d+)")
EFFORT_LINE = re.compile(r'Reasoning effort resolution: .*resolved="(\w+)"')


def fetch_coding_agent_usage(repo: str, runs: list[dict], cache_file: Path) -> dict:
    """Tokens per model from coding-agent run logs (`[cca-engine] turn=N assistant.usage: model=… input=… output=…`).

    Input tokens include the cached prompt; the log reports no credits. Completed runs are cached
    because Actions logs expire after the retention period.
    """
    cache: dict[str, dict] = json.loads(cache_file.read_text()) if cache_file.exists() else {}
    sel = [r for r in runs if r["category"] == "coding_agent" and r["executed"]]
    todo = [r for r in sel if str(r["id"]) not in cache or not r["completed"]]
    print(f"Fetching coding-agent logs for {len(todo)} runs ({len(cache)} cached) ...", file=sys.stderr)

    def parse(run_id: int) -> dict | None:
        try:
            log = run(["gh", "run", "view", str(run_id), "-R", repo, "--log"])
        except SystemExit:
            return None
        models: dict[str, dict] = defaultdict(lambda: {"requests": 0, "input": 0, "output": 0})
        for m in USAGE_LINE.finditer(log):
            u = models[m.group(1)]
            u["requests"] += 1
            u["input"] += int(m.group(2))
            u["output"] += int(m.group(3))
        effort = EFFORT_LINE.search(log)
        return {"models": dict(models), "effort": effort.group(1) if effort else None}

    with ThreadPoolExecutor(max_workers=4) as pool:
        for r, value in zip(todo, pool.map(parse, [r["id"] for r in todo]), strict=True):
            if value is not None:
                if r["completed"]:
                    cache[str(r["id"])] = value
                r["usage"] = value
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(cache), encoding="utf-8")

    by_model: dict[str, Counter] = defaultdict(Counter)
    efforts: Counter = Counter()
    sessions_with_usage = 0
    for r in sel:
        u = r.get("usage") or cache.get(str(r["id"]))
        if not u or not u["models"]:
            continue
        sessions_with_usage += 1
        efforts[u["effort"]] += 1
        for model, v in u["models"].items():
            by_model[model].update(v)
    return {
        "sessions": len(sel),
        "sessions_with_usage": sessions_with_usage,
        "reasoning_effort": dict(efforts),
        "by_model": {m: dict(v) for m, v in sorted(by_model.items(), key=lambda kv: -kv[1]["input"])},
    }


def fetch_ai_coach_usage(repo: str, since: datetime, cache_dir: Path) -> dict:
    """Tokens, models and AI credits for GitHub Agentic Workflow runs, via `gh aw logs`.

    `agent` = the coach itself; `detection` = the threat-detection pass over its output.
    1 AI credit = USD 0.01 (verified against list prices for claude-haiku-4.5).
    """
    print("Fetching AI coach usage (gh aw logs) ...", file=sys.stderr)
    stray = REPO_ROOT / ".github" / "aw" / "logs"  # gh aw always creates this default folder
    stray_existed = stray.exists()
    try:
        run(
            ["gh", "aw", "logs", "-r", repo, "--start-date", f"{since:%Y-%m-%d}", "-c", "1000"]
            + ["-o", str(cache_dir), "--json"]
        )
    except SystemExit:
        print("gh aw logs failed; using cached AI coach runs only", file=sys.stderr)
    finally:
        if not stray_existed and stray.exists() and {f.name for f in stray.iterdir()} <= {".gitignore"}:
            for f in stray.iterdir():
                f.unlink()
            stray.rmdir()
    # gh aw sometimes lists only part of the runs; every downloaded run stays in the cache, so read that.
    cached_runs = []
    for d in cache_dir.glob("run-*"):
        if (d / "run.json").exists():
            r = json.loads((d / "run.json").read_text(encoding="utf-8"))
            cached_runs.append({**r, "run_id": d.name.removeprefix("run-")})
    if not cached_runs:
        return {"available": False}
    by_step_model: dict[tuple[str, str], Counter] = defaultdict(Counter)
    by_coach: dict[str, Counter] = defaultdict(Counter)
    for r in cached_runs:
        if not ts(r["created_at"]) or ts(r["created_at"]) < since:
            continue
        coach = (r.get("workflow_name") or r.get("name") or "unknown").split(" · ")[0]
        by_coach[coach]["runs"] += 1
        for step in ("agent", "detection"):
            f = cache_dir / f"run-{r['run_id']}" / "usage" / step / "token_usage.jsonl"
            if not f.exists():
                continue
            for line in f.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                u = json.loads(line)
                tokens = {k: u.get(f"{k}_tokens") or 0 for k in ("input", "output", "cache_read", "cache_write")}
                credits = u.get("ai_credits_this_response") or 0
                c = by_step_model[(step, u.get("model") or "unknown")]
                c.update({**tokens, "requests": 1})
                c["ai_credits"] += credits
                by_coach[coach]["tokens"] += sum(tokens.values())
                by_coach[coach]["ai_credits"] += credits
    rows = [
        {"step": s, "model": m, **{k: round(v, 2) if k == "ai_credits" else v for k, v in c.items()}}
        for (s, m), c in sorted(by_step_model.items())
    ]
    total_credits = sum(r["ai_credits"] for r in rows)
    return {
        "available": True,
        "runs": sum(c["runs"] for c in by_coach.values()),
        "by_step_model": rows,
        "by_coach": {k: {**v, "ai_credits": round(v["ai_credits"], 1)} for k, v in sorted(by_coach.items())},
        "total_tokens": sum(r["input"] + r["output"] + r["cache_read"] + r["cache_write"] for r in rows),
        "total_ai_credits": round(total_credits, 1),
        "total_usd": round(total_credits * 0.01, 2),
    }


PR_QUERY = """
query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title createdAt mergedAt state additions deletions changedFiles headRefName
        author { login }
        commits { totalCount }
        closingIssuesReferences(first: 10) { nodes { number } }
        files(first: 100) { nodes { path additions } }
      }
    }
  }
}
"""


def collect_prs(repo: str) -> list[dict]:
    owner, name = repo.split("/")
    pages = gh_json(
        [
            "api",
            "graphql",
            "--paginate",
            "--slurp",
            "-F",
            f"owner={owner}",
            "-F",
            f"name={name}",
            "-f",
            f"query={PR_QUERY}",
        ]
    )
    prs = []
    for page in pages:
        for p in page["data"]["repository"]["pullRequests"]["nodes"]:
            p["author"] = p["author"] or {"login": "ghost"}
            p["commits"] = p["commits"]["totalCount"]
            p["closingIssuesReferences"] = p["closingIssuesReferences"]["nodes"]
            p["code_additions"] = sum(
                f["additions"]
                for f in p.pop("files")["nodes"]
                if Path(f["path"]).suffix in CODE_EXTENSIONS and not SYNTHETIC_DATA.search(Path(f["path"]).stem)
            )
            prs.append(p)
    return prs


def analyse_participation(
    issues: list[dict], comments: list[dict], journeys: list[dict], in_window, organisers: set[str], since: datetime
) -> dict:
    """Who took part: issues and comments by participants, organisers and agents, plus agent reply speed."""

    def role(user: dict) -> str:
        if user.get("type") == "Bot" or user["login"] in COPILOT_LOGINS or user["login"].startswith("app/"):
            return "agent"
        return "organiser" if user["login"] in organisers else "participant"

    window_issues = [i for i in issues if in_window(ts(i["createdAt"]))]
    window_comments = sorted((c for c in comments if in_window(ts(c["created_at"]))), key=lambda c: c["created_at"])

    people: dict[str, dict] = defaultdict(
        lambda: {"issues": 0, "ideas": 0, "ideas_with_preview": 0, "comments": 0, "words": 0, "threads": set()}
    )
    issues_by_role: Counter = Counter()
    for i in window_issues:
        r = role({"login": i["author"]["login"], "type": "Bot" if i["author"].get("is_bot") else "User"})
        issues_by_role[r] += 1
        if r != "agent":
            people[i["author"]["login"]]["issues"] += 1
    for j in journeys:
        people[j["author"]]["ideas"] += 1
        people[j["author"]]["ideas_with_preview"] += j["outcome"] == "preview-ready"

    comments_by_role: Counter = Counter()
    words_by_role: Counter = Counter()
    by_thread: dict[int, list[dict]] = defaultdict(list)
    thread_humans: dict[int, set[str]] = defaultdict(set)
    for c in window_comments:
        r = role(c["user"])
        words = len((c.get("body") or "").split())
        comments_by_role[r] += 1
        words_by_role[r] += words
        url = c.get("pull_request_url") or c.get("issue_url") or ""
        thread = int(url.rsplit("/", 1)[-1])
        by_thread[thread].append({"role": r, "at": ts(c["created_at"])})
        if r != "agent":
            thread_humans[thread].add(c["user"]["login"])
            p = people[c["user"]["login"]]
            p["comments"] += 1
            p["words"] += words
            p["threads"].add(thread)

    reply_latency = []
    for thread in by_thread.values():
        for k, c in enumerate(thread):
            if c["role"] == "participant":
                reply = next((x for x in thread[k + 1 :] if x["role"] == "agent"), None)
                if reply:
                    reply_latency.append(round((reply["at"] - c["at"]).total_seconds()))

    print(f"Fetching {len(people)} GitHub profiles ...", file=sys.stderr)
    table = []
    for login, p in people.items():
        created = ts(gh_json(["api", f"users/{login}"]).get("created_at"))
        table.append(
            {
                "login": login,
                "role": "organiser" if login in organisers else "participant",
                "issues": p["issues"],
                "ideas": p["ideas"],
                "ideas_with_preview": p["ideas_with_preview"],
                "comments": p["comments"],
                "words": p["words"],
                "threads": len(p["threads"]),
                "new_github_account": bool(created and created >= since - timedelta(days=30)),
            }
        )
    table.sort(key=lambda p: (p["role"] != "participant", -(p["comments"] + p["issues"])))
    participants = [p for p in table if p["role"] == "participant"]
    return {
        "participants": len(participants),
        "organisers": len(table) - len(participants),
        "new_github_accounts": sum(p["new_github_account"] for p in participants),
        "participants_with_idea": sum(p["ideas"] > 0 for p in participants),
        "issues_by_role": dict(issues_by_role),
        "comments_by_role": dict(comments_by_role),
        "words_by_role": dict(words_by_role),
        "agent_pickup_of_participant_comment_s": summary(reply_latency),
        "ideas_with_multiple_humans": sum(1 for j in journeys if len(thread_humans[j["issue"]] | {j["author"]}) > 1),
        "people": table,
    }


def analyse_iterations(
    runs: list[dict], agent_prs: list[dict], comments: list[dict], in_window, local: timezone, since: datetime
) -> tuple[list[dict], dict]:
    """Pair every agent session with the feedback that triggered it and the preview it produced.

    Version     = one coding-agent session on a pull request (initial build or revision).
    Ready       = end of the last successful preview deploy that started during the session
                  (or the first one after it); falls back to the session end.
    Feedback    = the triggering comment: latest human comment on the pull request or its idea issue
                  since the previous session started. Measures agent response, not human idle time.
    """
    by_branch = {p["headRefName"]: p for p in agent_prs}
    issue_of = {p["number"]: [r["number"] for r in p["closingIssuesReferences"]] for p in agent_prs}

    human_by_thread: dict[int, list[datetime]] = defaultdict(list)
    for c in comments:
        if c["user"]["type"] == "Bot":
            continue
        url = c.get("pull_request_url") or c.get("issue_url") or ""
        human_by_thread[int(url.rsplit("/", 1)[-1])].append(ts(c["created_at"]))

    sessions: dict[int, list[dict]] = defaultdict(list)
    deploys: dict[int, list[dict]] = defaultdict(list)
    for r in runs:
        pr = by_branch.get(r["head_branch"])
        if not pr or not r["executed"]:
            continue
        if r["category"] == "coding_agent":
            sessions[pr["number"]].append(r)
        elif r["name"] == "Deploy" and r["event"] == "pull_request" and r["conclusion"] == "success":
            deploys[pr["number"]].append(r)

    versions = []
    for number, runs_for_pr in sessions.items():
        runs_for_pr.sort(key=lambda r: r["start"])
        threads = [number, *issue_of.get(number, [])]
        human = sorted(t for n in threads for t in human_by_thread.get(n, []))
        previous_ready: datetime | None = None
        previous_start: datetime | None = None
        for index, s in enumerate(runs_for_pr):
            during = [d for d in deploys[number] if s["start"] <= d["start"] <= s["end"] + timedelta(minutes=2)]
            after = [d for d in deploys[number] if d["start"] > s["end"]]
            deploy = (
                max(during, key=lambda d: d["start"]) if during else min(after, key=lambda d: d["start"], default=None)
            )
            ready = deploy["end"] if deploy else s["end"]
            # The triggering comment: the latest human comment since the previous session started.
            window = [t for t in human if (previous_start or since) < t <= s["start"]]
            feedback = window[-1] if window else None
            is_build = s["name"].startswith("Running Copilot")
            trigger = "build" if is_build else ("human" if feedback else "automated")
            versions.append(
                {
                    "pr": number,
                    "version": index + 1,
                    "trigger": trigger,
                    "session_start": s["start"],
                    "ready": ready,
                    "agent_minutes": s["minutes"],
                    "feedback_at": feedback,
                    "feedback_to_ready_min": minutes(feedback, ready),
                    "since_previous_version_min": minutes(previous_ready, ready),
                }
            )
            previous_ready, previous_start = ready, s["start"]

    versions = [v for v in versions if in_window(v["session_start"])]
    revisions = [v for v in versions if v["trigger"] != "build"]
    human_revisions = [v for v in revisions if v["trigger"] == "human"]
    per_day: dict = defaultdict(list)
    per_index: dict = defaultdict(list)
    for v in human_revisions:
        per_day[v["ready"].astimezone(local).strftime("%Y-%m-%d")].append(v["feedback_to_ready_min"])
        per_index["5+" if v["version"] > 5 else str(v["version"] - 1)].append(v["feedback_to_ready_min"])
    versions_per_pr = Counter(v["pr"] for v in versions)
    return versions, {
        "versions": len(versions),
        "prototypes": len(versions_per_pr),
        "revisions_by_trigger": dict(Counter(v["trigger"] for v in revisions)),
        "versions_per_prototype": summary(list(versions_per_pr.values())),
        "feedback_to_new_version_min": summary([v["feedback_to_ready_min"] for v in human_revisions]),
        "between_versions_min": summary([v["since_previous_version_min"] for v in revisions]),
        "agent_minutes_per_revision": summary([v["agent_minutes"] for v in revisions]),
        "feedback_to_new_version_by_day": {d: summary(v) for d, v in sorted(per_day.items())},
        "feedback_to_new_version_by_revision": {k: summary(v) for k, v in sorted(per_index.items())},
    }


def collect_issue_milestones(repo: str, number: int) -> dict:
    events = gh_paginated(f"repos/{repo}/issues/{number}/timeline?per_page=100")
    first: dict[str, datetime] = {}
    human_comments: list[datetime] = []
    for e in events:
        when = ts(e.get("created_at"))
        if when is None:
            continue
        if e.get("event") == "labeled":
            first.setdefault(f"label:{e['label']['name']}", when)
        elif e.get("event") == "commented":
            if (e.get("user") or {}).get("type") == "Bot":
                first.setdefault("first_bot_comment", when)
            else:
                human_comments.append(when)
    return {"milestones": first, "human_comments": human_comments}


def git_codebase(ref: str, since: datetime) -> dict:
    log = run(
        [
            "git",
            "log",
            ref,
            f"--since={since.isoformat()}",
            "--format=%an%x1f%(trailers:key=Co-authored-by,valueonly)%x1e",
        ]
    )
    records = [c.strip() for c in log.split("\x1e") if c.strip()]
    return {
        "ref": ref,
        "commits": len(records),
        "commits_with_copilot": sum(1 for c in records if "copilot" in c.lower()),
    }


# ---------- analysis ----------


def analyse(repo: str, event_start: datetime, local: timezone, baseline: dict, organisers: set[str]) -> dict:
    now = datetime.now(UTC)
    print("Fetching workflow runs ...", file=sys.stderr)
    runs = collect_runs(repo, now)
    fetch_durations(repo, runs, CACHE_FILE, now, event_start)
    tokens = {
        "coding_agent": fetch_coding_agent_usage(repo, runs, CACHE_FILE.parent / "coding-agent-usage.json"),
        "ai_coaches": fetch_ai_coach_usage(repo, event_start, CACHE_FILE.parent / "aw-logs"),
    }

    print("Fetching issues, pull requests and comments ...", file=sys.stderr)
    issues = gh_json(
        [
            "issue",
            "list",
            "-R",
            repo,
            "--state",
            "all",
            "--limit",
            "1000",
            "--json",
            "number,title,author,createdAt,closedAt,state,labels",
        ]
    )
    prs = collect_prs(repo)
    comments = gh_paginated(f"repos/{repo}/issues/comments?per_page=100") + gh_paginated(
        f"repos/{repo}/pulls/comments?per_page=100"
    )

    def in_window(d: datetime | None) -> bool:
        return d is not None and d >= event_start

    # --- ideas and their journeys
    ideas = [i for i in issues if any(lbl["name"] == "idea" for lbl in i["labels"]) and in_window(ts(i["createdAt"]))]
    agent_prs = [p for p in prs if p["author"]["login"] in COPILOT_LOGINS]
    pr_for_issue: dict[int, dict] = {}
    for p in sorted(agent_prs, key=lambda p: p["createdAt"]):
        for ref in p["closingIssuesReferences"]:
            pr_for_issue.setdefault(ref["number"], p)

    print(f"Fetching timelines for {len(ideas)} ideas ...", file=sys.stderr)
    journeys = []
    for idea in ideas:
        created = ts(idea["createdAt"])
        tl = collect_issue_milestones(repo, idea["number"])
        m = tl["milestones"]
        pr = pr_for_issue.get(idea["number"])
        preview = m.get("label:preview-ready")
        journeys.append(
            {
                "issue": idea["number"],
                "title": idea["title"],
                "author": idea["author"]["login"],
                "created": created,
                "coach_first_reply_min": minutes(created, m.get("first_bot_comment")),
                "to_ready_for_build_min": minutes(created, m.get("label:ready-for-build")),
                "ready_to_agent_pr_min": minutes(m.get("label:ready-for-build"), ts(pr["createdAt"]) if pr else None),
                "to_first_preview_min": minutes(created, preview),
                "agent_pr": pr["number"] if pr else None,
                "agent_pr_additions": pr["additions"] if pr else 0,
                "agent_pr_commits": pr["commits"] if pr else 0,
                "human_comments_after_preview": len([c for c in tl["human_comments"] if preview and c > preview]),
                "outcome": next(
                    (
                        o
                        for o in ("preview-ready", "ready-for-build", "needs-refinement", "out-of-scope")
                        if f"label:{o}" in m
                    ),
                    "open",
                ),
            }
        )

    # --- agent sessions
    sel = [r for r in runs if r["executed"] and in_window(r["start"])]
    builds = [r for r in sel if r["category"] == "coding_agent" and r["name"].startswith("Running Copilot")]
    revisions = [r for r in sel if r["category"] == "coding_agent" and r["name"].startswith("Addressing comment")]
    coaches = [r for r in sel if r["category"] == "ai_coach"]
    revisions_per_pr = Counter(int(re.search(r"#(\d+)", r["name"]).group(1)) for r in revisions)

    peak, peak_at = peak_concurrency(
        [(r["start"], r["end"]) for r in sel if r["category"] in ("coding_agent", "ai_coach")]
    )
    coding_peak, coding_peak_at = peak_concurrency(
        [(r["start"], r["end"]) for r in sel if r["category"] == "coding_agent"]
    )

    coach_breakdown: dict = defaultdict(lambda: {"runs": 0, "minutes": 0.0})
    for r in coaches:
        b = coach_breakdown[r["name"].split(" · ")[0]]
        b["runs"] += 1
        b["minutes"] = round(b["minutes"] + r["minutes"], 1)

    compute: dict = defaultdict(float)
    for r in sel:
        compute[r["category"]] += r["minutes"]

    # --- activity series (local time)
    per_day: dict = defaultdict(lambda: {"ideas": 0, "agent_sessions": 0, "coach_runs": 0, "agent_minutes": 0.0})
    per_hour: dict = defaultdict(lambda: {"ideas": 0, "agent_sessions": 0, "coach_runs": 0})
    for r in sel:
        if r["category"] not in ("coding_agent", "ai_coach"):
            continue
        t = r["start"].astimezone(local)
        key = "agent_sessions" if r["category"] == "coding_agent" else "coach_runs"
        per_day[t.strftime("%Y-%m-%d")][key] += 1
        per_day[t.strftime("%Y-%m-%d")]["agent_minutes"] += r["minutes"]
        per_hour[t.strftime("%Y-%m-%d %H:00")][key] += 1
    for j in journeys:
        t = j["created"].astimezone(local)
        per_day[t.strftime("%Y-%m-%d")]["ideas"] += 1
        per_hour[t.strftime("%Y-%m-%d %H:00")]["ideas"] += 1

    # --- conversation
    window_comments = [c for c in comments if in_window(ts(c["created_at"]))]
    bot_comments = [c for c in window_comments if c["user"]["type"] == "Bot"]
    human_comments = [c for c in window_comments if c["user"]["type"] != "Bot"]

    window_agent_prs = [p for p in agent_prs if in_window(ts(p["createdAt"]))]
    previews = [
        r for r in sel if r["name"] == "Deploy" and r["event"] == "pull_request" and r["conclusion"] == "success"
    ]
    with_preview = [j for j in journeys if j["to_first_preview_min"] is not None]

    versions, iteration = analyse_iterations(runs, agent_prs, comments, in_window, local, event_start)
    pr_by_number = {p["number"]: p for p in agent_prs}
    per_pr_revisions: dict[int, list[dict]] = defaultdict(list)
    for v in versions:
        if v["trigger"] != "build":
            per_pr_revisions[v["pr"]].append(v)
    most_iterated = [
        {
            "pr": number,
            "issue": next((r["number"] for r in pr_by_number[number]["closingIssuesReferences"]), None),
            "title": pr_by_number[number]["title"],
            "revisions": len(vs),
            "median_feedback_to_ready_min": summary([v["feedback_to_ready_min"] for v in vs]).get("median"),
        }
        for number, vs in sorted(per_pr_revisions.items(), key=lambda kv: len(kv[1]), reverse=True)[:5]
    ]
    spans = defaultdict(list)
    for v in versions:
        spans[v["pr"]].append(v)
    prototype_hours = [
        (max(v["ready"] for v in vs) - min(v["session_start"] for v in vs)).total_seconds() / 3600
        for vs in spans.values()
    ]
    code_lines = sum(p["code_additions"] for p in window_agent_prs)
    loc = baseline["loc_per_dev_day"]
    effort = {
        "assumptions": baseline,
        "agent_code_lines": code_lines,
        "dev_days": {
            "low": round(code_lines / (loc * 2)),
            "mid": round(code_lines / loc),
            "high": round(code_lines / (loc / 2)),
        },
        "versions": len(versions),
        "sprint_weeks_at_one_version_per_sprint": len(versions) * baseline["sprint_weeks"],
        "median_versions_per_prototype": iteration["versions_per_prototype"].get("median"),
        "median_prototype_active_hours": round(statistics.median(prototype_hours), 1) if prototype_hours else None,
    }
    return {
        "generated_at": now,
        "repo": repo,
        "window_start": event_start,
        "ideas": {
            "submitted": len(journeys),
            "distinct_submitters": len({j["author"] for j in journeys}),
            "outcomes": dict(Counter(j["outcome"] for j in journeys)),
            "coach_first_reply_min": summary([j["coach_first_reply_min"] for j in journeys]),
            "idea_to_ready_for_build_min": summary([j["to_ready_for_build_min"] for j in journeys]),
            "ready_to_agent_pr_min": summary([j["ready_to_agent_pr_min"] for j in journeys]),
            "idea_to_first_preview_min": summary([j["to_first_preview_min"] for j in journeys]),
            "fastest_journeys": sorted(with_preview, key=lambda j: j["to_first_preview_min"])[:5],
            "most_iterated": most_iterated,
        },
        "agents": {
            "build_sessions": len(builds),
            "revision_sessions": len(revisions),
            "prs_with_feedback_revisions": len(revisions_per_pr),
            "build_session_min": summary([r["minutes"] for r in builds]),
            "revision_session_min": summary([r["minutes"] for r in revisions]),
            "ai_coach_runs": len(coaches),
            "ai_coach_breakdown": dict(coach_breakdown),
            "agent_hours_total": round((compute["coding_agent"] + compute["ai_coach"]) / 60, 1),
            "peak_concurrent_agents": peak,
            "peak_concurrent_agents_at": peak_at,
            "peak_concurrent_coding_agents": coding_peak,
            "peak_concurrent_coding_agents_at": coding_peak_at,
        },
        "compute_hours": {k: round(v / 60, 1) for k, v in sorted(compute.items())},
        "workflow_runs": {"triggered": len([r for r in runs if in_window(r["start"])]), "executed": len(sel)},
        "pull_requests": {
            "total": len([p for p in prs if in_window(ts(p["createdAt"]))]),
            "by_coding_agent": len(window_agent_prs),
            "agent_lines_added": sum(p["additions"] for p in window_agent_prs),
            "agent_lines_deleted": sum(p["deletions"] for p in window_agent_prs),
            "agent_files_changed": sum(p["changedFiles"] for p in window_agent_prs),
            "agent_commits": sum(p["commits"] for p in window_agent_prs),
            "merged": len([p for p in prs if in_window(ts(p["mergedAt"]))]),
            "preview_deployments": len(previews),
        },
        "conversation": {
            "agent_comments": len(bot_comments),
            "agent_words": sum(len((c.get("body") or "").split()) for c in bot_comments),
            "human_comments": len(human_comments),
            "distinct_humans": len({c["user"]["login"] for c in human_comments} | {j["author"] for j in journeys}),
            "by_author": dict(Counter(c["user"]["login"] for c in window_comments).most_common()),
        },
        "codebase": git_codebase("origin/main", event_start),
        "iteration": iteration,
        "tokens": tokens,
        "cost": analyse_cost(
            tokens,
            sum(r.get("billable_minutes", 0) for r in sel),
            fetch_azure_cost(repo, event_start, now),
            Counter(j["outcome"] for j in journeys).get("preview-ready", 0),
            iteration["versions"],
        ),
        "participation": analyse_participation(issues, comments, journeys, in_window, organisers, event_start),
        "effort_heuristic": effort,
        "versions": versions,
        "per_day": {d: {**v, "agent_minutes": round(v["agent_minutes"], 1)} for d, v in sorted(per_day.items())},
        "per_hour": dict(sorted(per_hour.items())),
        "journeys": sorted(journeys, key=lambda j: j["issue"]),
    }


# ---------- report ----------


def fmt_min(v: float | None) -> str:
    if v is None:
        return "–"
    return f"{v:.0f} min" if v < 120 else f"{v / 60:.1f} h"


def render_participation(s: dict) -> list[str]:
    pa = s["participation"]
    cr, wr, ir = pa["comments_by_role"], pa["words_by_role"], pa["issues_by_role"]
    reply = pa["agent_pickup_of_participant_comment_s"]
    human_comments = cr.get("participant", 0) + cr.get("organiser", 0)
    return [
        "## Participation",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Participants (excluding organisers) | **{pa['participants']}**, of whom {pa['participants_with_idea']} "
        f"submitted an idea; {pa['new_github_accounts']} created a GitHub account for the event |",
        f"| Organisers / facilitators | {pa['organisers']} |",
        f"| Issues opened by participants / organisers / agents | {ir.get('participant', 0)} / "
        f"{ir.get('organiser', 0)} / {ir.get('agent', 0)} |",
        f"| Comments by participants / organisers / agents | {cr.get('participant', 0)} / "
        f"{cr.get('organiser', 0)} / {cr.get('agent', 0)} |",
        f"| Words by participants / organisers / agents | {wr.get('participant', 0):,} / "
        f"{wr.get('organiser', 0):,} / {wr.get('agent', 0):,} |",
        f"| Agent comments per human comment | {cr.get('agent', 0) / max(human_comments, 1):.1f} |",
        f"| Participant comment picked up by an agent | **{reply.get('median')} s** median "
        f"(n={reply['n']}, max {reply.get('max')} s); the revised prototype follows in the "
        "feedback → new version time below |",
        f"| Ideas discussed by more than one person | {pa['ideas_with_multiple_humans']} |",
        "",
        "| Person | Role | Issues | Ideas → preview | Comments | Words | Threads |",
        "|---|---|---|---|---|---|---|",
        *[
            f"| {p['login']}{' (new account)' if p['new_github_account'] else ''} | {p['role']} | {p['issues']} | "
            f"{p['ideas']} → {p['ideas_with_preview']} | {p['comments']} | {p['words']:,} | {p['threads']} |"
            for p in pa["people"]
        ],
        "",
    ]


def fmt_tokens(n: float) -> str:
    return f"{n / 1e6:.1f} M" if n >= 1e6 else f"{n / 1e3:.0f} k"


def render_tokens(s: dict) -> list[str]:
    ca, aw = s["tokens"]["coding_agent"], s["tokens"]["ai_coaches"]
    lines = [
        "## Models and tokens",
        "",
        "| Agent | Model | Requests | Input tokens | Output tokens | AI credits (USD) |",
        "|---|---|---|---|---|---|",
    ]
    for model, u in ca["by_model"].items():
        lines.append(
            f"| Coding agent | {model} | {u['requests']:,} | {fmt_tokens(u['input'])} | "
            f"{fmt_tokens(u['output'])} | not reported |"
        )
    if aw.get("available"):
        for r in aw["by_step_model"]:
            who = "AI coaches" if r["step"] == "agent" else "AI coaches: safety check"
            prompt = r["input"] + r["cache_read"] + r["cache_write"]
            lines.append(
                f"| {who} | {r['model']} | {r['requests']:,} | {fmt_tokens(prompt)} "
                f"| {fmt_tokens(r['output'])} | {r['ai_credits']:.0f} (${r['ai_credits'] * 0.01:.2f}) |"
            )
    total_in = sum(u["input"] for u in ca["by_model"].values())
    total_out = sum(u["output"] for u in ca["by_model"].values())
    lines += [
        "",
        f"Coding agent: {ca['sessions_with_usage']} of {ca['sessions']} sessions logged usage; "
        f"{fmt_tokens(total_in + total_out)} tokens (input includes cached prompt); reasoning effort "
        + ", ".join(f"{k}: {v}" for k, v in ca["reasoning_effort"].items())
        + ".",
    ]
    if aw.get("available"):
        lines.append(
            f"AI coaches: {aw['runs']} runs, {fmt_tokens(aw['total_tokens'])} tokens, "
            f"**{aw['total_ai_credits']:.0f} AI credits ≈ ${aw['total_usd']:.2f}** in total."
        )
    return [*lines, ""]


def render_iteration(s: dict) -> list[str]:
    it, e = s["iteration"], s["effort_heuristic"]
    fb, gap = it["feedback_to_new_version_min"], it["between_versions_min"]
    triggers = it["revisions_by_trigger"]
    a = e["assumptions"]
    weeks = e["sprint_weeks_at_one_version_per_sprint"]
    lines = [
        "## Iteration speed",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Versions shipped (build + revisions) | **{it['versions']}** across {it['prototypes']} prototypes |",
        f"| Revisions triggered by humans / by agents (critic) | {triggers.get('human', 0)} / "
        f"{triggers.get('automated', 0)} |",
        f"| Median versions per prototype | {it['versions_per_prototype'].get('median', '–')} "
        f"(max {it['versions_per_prototype'].get('max', '–')}) |",
        f"| Median human feedback → new running version | **{fmt_min(fb.get('median'))}** "
        f"(p75 {fmt_min(fb.get('p75'))}, fastest {fmt_min(fb.get('min'))}) |",
        f"| Median time between consecutive versions | {fmt_min(gap.get('median'))} |",
        "",
        "Feedback → new version, by revision number:",
        "",
        "| Revision | n | Median | p75 |",
        "|---|---|---|---|",
        *[
            f"| {k} | {v['n']} | {fmt_min(v.get('median'))} | {fmt_min(v.get('p75'))} |"
            for k, v in it["feedback_to_new_version_by_revision"].items()
        ],
        "",
        "Feedback → new version, by day:",
        "",
        "| Day | n | Median | p75 |",
        "|---|---|---|---|",
        *[
            f"| {d} | {v['n']} | {fmt_min(v.get('median'))} | {fmt_min(v.get('p75'))} |"
            for d, v in it["feedback_to_new_version_by_day"].items()
        ],
        "",
        "## Traditional-delivery comparison (heuristic)",
        "",
        "| Lens | Agents | Traditional estimate |",
        "|---|---|---|",
        f"| Cadence | {e['versions']} versions; median prototype {e['median_versions_per_prototype']} versions "
        f"in {e['median_prototype_active_hours']} h | {weeks} sprint-weeks at one version per "
        f"{a['sprint_weeks']}-week sprint (~{weeks / 52:.1f} team-years) |",
        f"| Effort | {e['agent_code_lines']:,} lines of .py/.ts/.tsx/.css, synthetic-data files excluded | "
        f"{e['dev_days']['low']}–{e['dev_days']['high']} developer-days "
        f"(mid {e['dev_days']['mid']}, at {a['loc_per_dev_day'] // 2}–{a['loc_per_dev_day'] * 2} lines/day) |",
        "",
        "Heuristic assumptions are flags (`--sprint-weeks`, `--loc-per-dev-day`). Lines per day is a weak "
        "proxy: it excludes design, clinical alignment and review.",
        "",
    ]
    return lines


def render(s: dict, local: timezone) -> str:
    i, a, p, c, cb = s["ideas"], s["agents"], s["pull_requests"], s["conversation"], s["codebase"]
    preview = i["idea_to_first_preview_min"]
    peak_at = a["peak_concurrent_agents_at"]
    peak_when = f" ({peak_at.astimezone(local):%a %d %b %H:%M})" if peak_at else ""
    window = s["window_start"].strftime("%Y-%m-%d")
    lines = [
        "# Hackathon in numbers",
        "",
        f"_Generated {s['generated_at'].astimezone(local):%Y-%m-%d %H:%M} (local) from `{s['repo']}`; "
        f"activity since {window}._",
        "",
        "## Headline",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Ideas submitted | **{i['submitted']}** by {i['distinct_submitters']} people |",
        f"| Ideas that reached a running preview | **{i['outcomes'].get('preview-ready', 0)}** |",
        f"| Median idea → first running preview | **{fmt_min(preview.get('median'))}** "
        f"(fastest {fmt_min(preview.get('min'))}) |",
        f"| Median idea → first coaching reply | {fmt_min(i['coach_first_reply_min'].get('median'))} |",
        f"| Median feedback → new running version | "
        f"**{fmt_min(s['iteration']['feedback_to_new_version_min'].get('median'))}** |",
        f"| Versions shipped | **{s['iteration']['versions']}** (build + revisions) |",
        f"| Coding-agent build sessions | **{a['build_sessions']}** |",
        f"| Coding-agent revision sessions from feedback | **{a['revision_sessions']}** "
        f"on {a['prs_with_feedback_revisions']} prototypes |",
        f"| AI coach runs | **{a['ai_coach_runs']}** |",
        f"| Cumulative agent execution | **{a['agent_hours_total']} h** |",
        f"| Peak agents working simultaneously | **{a['peak_concurrent_agents']}**{peak_when} |",
        f"| Peak coding agents building simultaneously | {a['peak_concurrent_coding_agents']} |",
        f"| Lines added by the coding agent | **{p['agent_lines_added']:,}** (−{p['agent_lines_deleted']:,}) |",
        f"| Coding-agent commits / pull requests | {p['agent_commits']} / {p['by_coding_agent']} |",
        f"| Preview deployments (PR build → test → deploy) | {p['preview_deployments']} |",
        f"| Agent comments | {c['agent_comments']} (~{c['agent_words']:,} words) vs {c['human_comments']} human |",
        f"| Humans involved | {c['distinct_humans']} |",
        "",
        *render_participation(s),
        *render_tokens(s),
        "## Cost (realistic and worst case)",
        "",
        *render_cost(s),
        "## Compute (Actions execution hours, executed runs only)",
        "",
        "| Category | Hours |",
        "|---|---|",
        *[f"| {k.replace('_', ' ')} | {v} |" for k, v in s["compute_hours"].items()],
        "",
        f"Workflow runs triggered: {s['workflow_runs']['triggered']:,}; executed (not skipped): "
        f"{s['workflow_runs']['executed']:,}.",
        "",
        "## AI coaches",
        "",
        "| Coach | Runs | Minutes |",
        "|---|---|---|",
        *[f"| {k} | {v['runs']} | {v['minutes']:.0f} |" for k, v in a["ai_coach_breakdown"].items()],
        "",
        "## Pipeline stage times",
        "",
        "| Stage | n | Median | p75 | Fastest |",
        "|---|---|---|---|---|",
    ]
    for label, key in [
        ("Idea → first coaching reply", "coach_first_reply_min"),
        ("Idea → ready-for-build", "idea_to_ready_for_build_min"),
        ("ready-for-build → agent PR opened", "ready_to_agent_pr_min"),
        ("Idea → first running preview", "idea_to_first_preview_min"),
    ]:
        v = i[key]
        lines.append(
            f"| {label} | {v['n']} | {fmt_min(v.get('median'))} | {fmt_min(v.get('p75'))} | {fmt_min(v.get('min'))} |"
        )
    lines += [
        "",
        "## Fastest idea → preview",
        "",
        "| Issue | Idea | Idea → preview | Lines added |",
        "|---|---|---|---|",
        *[
            f"| #{j['issue']} | {j['title']} | {fmt_min(j['to_first_preview_min'])} | {j['agent_pr_additions']:,} |"
            for j in i["fastest_journeys"]
        ],
        "",
        "## Most iterated with clinicians",
        "",
        "| Issue | Prototype | Revisions | Median feedback → new version |",
        "|---|---|---|---|",
        *[
            f"| #{j['issue']} | {j['title']} | {j['revisions']} | {fmt_min(j['median_feedback_to_ready_min'])} |"
            for j in i["most_iterated"]
        ],
        "",
        *render_iteration(s),
        "## Per day",
        "",
        "| Day | Ideas | Coding-agent sessions | Coach runs | Agent hours |",
        "|---|---|---|---|---|",
        *[
            f"| {d} | {v['ideas']} | {v['agent_sessions']} | {v['coach_runs']} | {v['agent_minutes'] / 60:.1f} |"
            for d, v in s["per_day"].items()
        ],
        "",
        "## Platform changes on main",
        "",
        f"{cb['commits']} commits since {window}, {cb['commits_with_copilot']} involving Copilot. "
        "Prototypes are not merged: each lives in its own preview pull request.",
        "",
        "## Caveats",
        "",
        f"- Only activity from {window} is counted; earlier activity was organiser testing.",
        "- Durations come from job start/end times. Runs that never started a job (for example, waiting "
        "for approval) are excluded.",
        "- Agent hours overlap: parallel runs count separately. Do not present them as saved human hours.",
        "- Coding-agent lines include prototypes that stay in their own preview pull request.",
        '- "Human" includes organisers. Journeys cover issues labelled `idea` only.',
    ]
    return "\n".join(lines) + "\n"


def render_highlights(s: dict, local: timezone) -> str:
    """Audience version for clinicians and researchers: story first, method in the fine print."""
    i, a, p, it, pa = s["ideas"], s["agents"], s["pull_requests"], s["iteration"], s["participation"]
    eff, ca, aw = s["effort_heuristic"], s["tokens"]["coding_agent"], s["tokens"]["ai_coaches"]
    preview, fb = i["idea_to_first_preview_min"], it["feedback_to_new_version_min"]
    pickup = pa["agent_pickup_of_participant_comment_s"]
    coaches = a["ai_coach_breakdown"]
    days = len(s["per_day"])
    previews = i["outcomes"].get("preview-ready", 0)
    coding_models = ", ".join(ca["by_model"])
    coach_models = sorted({r["model"] for r in aw.get("by_step_model", []) if r["step"] == "agent"})
    check_models = sorted({r["model"] for r in aw.get("by_step_model", []) if r["step"] == "detection"})
    total_tokens = sum(u["input"] + u["output"] for u in ca["by_model"].values()) + aw.get("total_tokens", 0)
    window = f"{s['window_start']:%d %b} – {s['generated_at'].astimezone(local):%d %b %Y, %H:%M}"
    lines = [
        "# Oncology Hackathon 2026 Munich: what AI agents built",
        "",
        f"_{days} days, {window}. Source: GitHub activity on `{s['repo']}`. All patient data is synthetic._",
        "",
        "## In one line",
        "",
        f"People described **{i['submitted']} oncology ideas** in plain language. AI agents turned "
        f"**{previews}** of them into working, clickable software: a median of **{fmt_min(preview.get('median'))}** "
        f"from idea to running prototype, then a new running version **{fmt_min(fb.get('median'))}** after each "
        "piece of clinical feedback.",
        "",
        "## The numbers",
        "",
        "| | |",
        "|---|---|",
        f"| **{i['submitted']} → {previews}** | ideas submitted → working prototypes |",
        f"| **{fmt_min(preview.get('median'))}** | median idea → running prototype "
        f"(fastest {fmt_min(preview.get('min'))}) |",
        f"| **{fmt_min(i['coach_first_reply_min'].get('median'))}** | until an AI coach replies to a new idea |",
        f"| **{pickup.get('median'):.0f} s** | until an agent picks up a clinician's comment |",
        f"| **{fmt_min(fb.get('median'))}** | from feedback to a new running version |",
        f"| **{it['versions']}** | versions shipped across {it['prototypes']} prototypes |",
        f"| **{p['agent_lines_added']:,}** | lines of code written by the coding agent |",
        f"| **{a['peak_concurrent_agents']}** | AI agents working at the same time, at peak |",
        f"| **{a['agent_hours_total']:.0f} h** | of cumulative agent work |",
        "",
        "## How an idea became software",
        "",
        "1. **Describe.** A clinician or researcher writes the idea as a GitHub issue. No code, no specification.",
        f"2. **Coach.** An AI idea coach answers within {fmt_min(i['coach_first_reply_min'].get('median'))}, "
        "sharpens the clinical question, checks scope and proposes what to build "
        f"(median {fmt_min(i['idea_to_ready_for_build_min'].get('median'))} to an approved build plan).",
        "3. **Build.** A coding agent writes the prototype, its synthetic patient data and its tests. Each version "
        "is built, tested and deployed as a live preview.",
        f"4. **Critique.** A critic agent reviews new builds against the clinical intent "
        f"({coaches.get('Post-build critic', {}).get('runs', 0)} reviews).",
        f"5. **Iterate.** The participant comments; an agent picks it up within seconds and the next version is "
        f"live {fmt_min(fb.get('median'))} later.",
        "",
        "## Iterating with clinicians",
        "",
        f"A sprint team ships one version every few weeks. Here, consecutive versions were "
        f"**{fmt_min(it['between_versions_min'].get('median'))}** apart.",
        "",
        "| Prototype | Versions after feedback | Median feedback → new version |",
        "|---|---|---|",
        *[
            f"| #{m['issue']} {m['title']} | {m['revisions']} | {fmt_min(m['median_feedback_to_ready_min'])} |"
            for m in i["most_iterated"][:3]
        ],
        "",
        "## Who took part",
        "",
        f"- **{pa['participants']} clinicians and researchers**, supported by {pa['organisers']} organisers.",
        f"- {pa['new_github_accounts']} created a GitHub account specifically for the event.",
        f"- {i['submitted']} ideas from {i['distinct_submitters']} people; "
        f"{pa['ideas_with_multiple_humans']} ideas were shaped by more than one person.",
        "",
        "## What this would traditionally take",
        "",
        f"- **Cadence:** {eff['versions']} versions at one per {eff['assumptions']['sprint_weeks']}-week sprint = "
        f"**{eff['sprint_weeks_at_one_version_per_sprint']} sprint-weeks** "
        f"(~{eff['sprint_weeks_at_one_version_per_sprint'] / 52:.1f} team-years).",
        f"- **Effort:** {eff['agent_code_lines']:,} lines of application code ≈ "
        f"**{eff['dev_days']['low']}–{eff['dev_days']['high']} developer-days** "
        f"at {eff['assumptions']['loc_per_dev_day'] // 2}–{eff['assumptions']['loc_per_dev_day'] * 2} lines a day.",
        "",
        "Both are rough heuristics. They leave out clinical alignment, design and review, which still need people.",
        "",
        "## What it cost",
        "",
        f"Not wireframes or mock-ups: {previews} running, clickable applications with synthetic patient data, "
        f"rebuilt and redeployed {it['versions']} times. They are prototypes for discussion, not production systems.",
        "",
        f"**Worst case: ${s['cost']['total']['worst']:,.0f} in total, "
        f"${s['cost']['per_prototype']['worst']:,.0f} per working prototype.** "
        f"Realistic: ${s['cost']['total']['realistic']:,.0f}.",
        "",
        *render_cost(s),
        "## Under the hood",
        "",
        f"- **Models:** coding agent {coding_models}; AI coaches {', '.join(coach_models) or 'n/a'}; safety check "
        f"on every coach answer {', '.join(check_models) or 'n/a'}.",
        f"- **Scale:** ~{fmt_tokens(total_tokens)} tokens processed; {it['versions']} versions; "
        f"{p['preview_deployments']} preview deployments.",
    ]
    lines += [
        "- **Data:** synthetic patients only; no real patient data.",
        "",
        "## Fine print",
        "",
        f"- Counts activity from {s['window_start']:%Y-%m-%d}; earlier activity was organiser testing.",
        "- Agent hours overlap: agents run in parallel. They are not saved human hours.",
        "- Coding-agent cost is estimated from logged tokens and list prices (gpt-6.x priced as gpt-5.6); "
        "token counts include re-sent cached context.",
        "- Prototypes are previews for discussion, not clinical software.",
        "- Full method and per-metric detail: [`report.md`](report.md). Regenerate with "
        "`python scripts/hackathon-stats/collect_stats.py`.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo", help="owner/name (default: current gh repository)")
    parser.add_argument(
        "--event-start",
        default=EVENT_START,
        help=f"Count activity from this local date (YYYY-MM-DD); earlier activity was testing (default {EVENT_START})",
    )
    parser.add_argument("--utc-offset", type=int, default=2, help="Local display offset in hours (CEST = 2)")
    parser.add_argument("--out", default=str(REPO_ROOT / "docs" / "hackathon-stats"))
    parser.add_argument(
        "--loc-per-dev-day",
        type=int,
        default=100,
        help="Heuristic: tested prototype code lines one developer writes per day (report shows ×0.5–×2)",
    )
    parser.add_argument("--sprint-weeks", type=int, default=3, help="Heuristic: weeks per version in a sprint cadence")
    parser.add_argument(
        "--organisers",
        default=",".join(ORGANISERS),
        help="Comma-separated GitHub logins reported as organisers rather than participants",
    )
    args = parser.parse_args()

    repo = args.repo or gh_json(["repo", "view", "--json", "nameWithOwner"])["nameWithOwner"]
    run(["git", "fetch", "--quiet", "origin"])
    local = timezone(timedelta(hours=args.utc_offset))
    start = datetime.fromisoformat(args.event_start).replace(tzinfo=local)

    stats = analyse(
        repo,
        start,
        local,
        {"loc_per_dev_day": args.loc_per_dev_day, "sprint_weeks": args.sprint_weeks},
        {o.strip() for o in args.organisers.split(",") if o.strip()},
    )
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "snapshot.json").write_text(
        json.dumps(stats, indent=2, default=lambda o: o.isoformat() if isinstance(o, datetime) else str(o)),
        encoding="utf-8",
    )
    (out / "report.md").write_text(render(stats, local), encoding="utf-8")
    (out / "highlights.md").write_text(render_highlights(stats, local), encoding="utf-8")
    print(f"Wrote {out / 'report.md'} and {out / 'highlights.md'}", file=sys.stderr)


if __name__ == "__main__":
    main()
