# Purpose and learnings (read first)

Why this hackathon exists, what "good" looks like, and what we learned running the pipeline.
Every agent – coach, coding agent, critic – should use this to decide when rules conflict.

## 1. What we want to achieve

**Let a clinician see their own idea working inside a hospital system – within the hour, without
writing code – so they can react, refine and decide if it is worth pursuing.**

- **Audience.** Oncologists, nurses, MDT coordinators, pharmacists, researchers. Mostly
  non-technical. They judge by what they see and click, not by code or architecture.
- **Output.** A clickable prototype, not a product. It exists to start a conversation
  ("yes, but in tumour board I'd also need …"), then be iterated via `@copilot` comments.
- **Measure of success.** The participant recognises their clinical insight on screen and
  can picture it in their daily software. Everything else is secondary.

## 2. The flow (each step must be visible to the participant)

| # | Step | What the participant sees |
|---|---|---|
| 1 | Opens a GitHub issue | Issue form |
| 2 | Idea coach | "Working on it" status comment within seconds, then a plain-language proposal |
| 3 | Assigned to Copilot | "🛠️ Building your prototype" comment |
| 4 | Copilot builds a pull request | Nothing to do – silence is fine, the status comment explains |
| 5 | Deployed preview | Comment "✅ live · v1.0" with a direct link to `/#/idea/<N>` |
| 6 | Each new build | "🆕 New version live · v1.N" comment on the issue |

Rule: **the participant should never wonder whether something is happening.** Acknowledge fast,
report progress, link straight to the result.

## 3. What a good prototype looks like

1. **Opens straight on the idea.** The link goes to `/#/idea/<N>`; the main screen is visible
   with no scrolling, setup or configuration. A sensible synthetic patient is pre-selected.
2. **Looks like boring hospital software.** `HospitalShell`: app bar, patient banner, left
   navigation, dense tables, tabs. Not a startup landing page, not a chat window. Familiar beats
   pretty – the clinician must think "this could sit in our system".
3. **Full of fake data.** Worklists, lab results, notes, histories, extra patients. An empty or
   sparse screen fails to convey a real clinic day. Inline synthetic rows are fine.
4. **Things react when clicked.** Rows open charts, tabs switch, acknowledge / approve /
   file-to-chart change state. Local state is enough; no backend needed for these.
5. **The AI is one part of the screen, not the screen.** A panel, tab or side pane inside the
   workflow, powered by the Copilot SDK, returning UI blocks. The human approves before anything
   is "filed".
6. **Plain words.** Titles, taglines, buttons and PR descriptions use the clinician's language
   ("Patients like mine who were left out of trials", not "Cohort explorer").

## 4. What does not matter here

Security hardening, auth, telemetry, logging, performance, caching, retries, config layers,
exhaustive tests, edge cases. Do not add them unless the proposal asks. One smoke test is enough.
Bias to action: smallest version that shows the walkthrough end to end, then stop.

Non-negotiables still apply: synthetic data only, prototype disclaimer visible, Copilot SDK central.

## 5. Learnings from running the pipeline

Each learning states the failure we saw and the rule that prevents it.

| Seen | Rule |
|---|---|
| Coach took ~4 min; participant saw nothing and assumed it was broken | Post a status comment immediately; keep workflow steps minimal (no extra gating/detection jobs) |
| Preview link was posted while the PR held only the "Initial plan" commit | Deploy only once Copilot drops `[WIP]` from the title; say "building" first, link second |
| Idea code was appended below the landing page; participant saw no difference | Each idea lives in `frontend/src/ideas/issue-<N>/` and `backend/app/ideas/issue_<N>.py`; never edit `App.tsx` or `main.py` |
| The idea only appeared after typing a specific prompt into the starter agent | The idea's main screen must show immediately on `/#/idea/<N>` |
| Internal terms ("cohort explorer") confused clinicians | Use the participant's words for titles and labels |
| PR branches conflicted with `main` and deploys silently stopped | Keep ideas in their own files so branches merge cleanly; if conflicted, merge `main` in |
| A generic dark "AI demo" look did not help clinicians picture the idea | Style idea pages as plain hospital software with lots of fake data |
| Proposals were written for engineers | Proposal = plain-language walkthrough of hospital screens ("You open the worklist …") |

## 6. When in doubt

Ask: **"Will a busy oncologist, clicking this link on their phone between patients, recognise
their idea within ten seconds?"** If not, fix that before anything else.
