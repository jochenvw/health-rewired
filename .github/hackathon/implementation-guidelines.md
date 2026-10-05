# Implementation guidelines

For the GitHub Copilot coding agent building an approved idea.

## Hackathon mindset (read first)

This is a hackathon. You are building a **prototype** that non-technical medical professionals will
click through, react to, and iterate on with you. Speed to something visible beats completeness.

- **Bias to action.** Build the smallest version that shows the proposal's walkthrough end to end,
  then stop. Participants refine it afterwards by replying on their idea issue; the feedback relay
  keeps passing focused requests to the linked Copilot pull request until they reply
  `/architecture` to mark the prototype done.
- **Visible over robust.** Spend effort on what the participant sees and clicks. Skip edge cases,
  exhaustive validation and error paths that do not affect the demo.
- **Non-functional requirements are not a priority.** Do not add auth, security hardening,
  telemetry/instrumentation, logging frameworks, performance tuning, caching, retries or
  configuration layers unless the proposal explicitly asks for them.
- **Minimal tests.** One quick smoke test for new backend behaviour is enough; lint and existing
  tests must still pass.
- **Talk like a colleague.** The PR description and any comments are read by clinicians: say what
  they can now try, in plain words, and what they could ask for next.
- The build rules below still apply – especially the non-negotiables: synthetic data only, the
  prototype disclaimer, and the Copilot SDK at the centre.

## Start here

1. Read the issue, **the latest "🚀 Implementation proposal" comment**, and the conversation.
   The proposal is the contract. The participant's clinical insight is the point.
2. Read [`design-language.md`](design-language.md) before designing the page. It is the common
   visual and interaction foundation across demos; the proposal still determines the role,
   workflow and storyline.
3. Read [`capability-cards.md`](capability-cards.md) for the capabilities the proposal names.
4. Where code goes – **each idea lives in its own files**, so ideas never collide and can later all
   be merged into `main`, where the landing page lists every idea:
   - Page: `frontend/src/ideas/issue-<N>/index.tsx` exporting `meta` (`id: "<N>"`, `issue: <N>`,
     plain-language `title` and one-line `tagline`) and a default component. It is discovered
     automatically, appears on the landing page, and opens at `/#/idea/<N>`. Copy
     `frontend/src/ideas/starter/index.tsx` as a starting point. Idea-specific CSS goes in a file in
     the same folder.
   - API: `backend/app/ideas/issue_<N>.py` exposing `router = APIRouter(prefix="/api/ideas/<N>")`,
     discovered automatically. Put idea-specific prompts, tools and helpers there and call
     `run_agent(request, system_prompt=..., extra_tools=[...])` from `app.agent`.
   - Shared, reusable pieces (new UI block types, generally useful tools, synthetic data) may go in
     the shared places: `frontend/src/blocks/`, `backend/app/agent/`, `/sample-data`.

## Build rules

0. **The idea gets its own page – do not touch the landing page.** Do not edit
   `frontend/src/App.tsx` or `backend/app/main.py`; add your idea page and router as described
   in "Where code goes". The participant's link opens `/#/idea/<N>` directly, so the page must
   show the idea's main screen immediately, with no scrolling and no setup: pre-select a sensible
   synthetic patient or example and make the main action one obvious button. The `title` and
   `tagline` are read by clinicians – use their words, not internal terms (say "Patients like
   mine who were left out of trials", not "Cohort explorer").
0a. **Two horizons on one screen.** Read [`two-horizons.md`](two-horizons.md). Put a clearly labelled
   "In six months" / "Moonshot" switch in the header. The six-month view uses items from
   `/sample-data/minimum-dataset-crc.md`, shows per hospital what must be provided
   (available · partly · not yet) and how much of the problem is covered. The moonshot view is the
   full vision. Same storyline in both; make the difference visible.
1. **Copilot SDK stays central.** Agent behaviour goes through `backend/app/agent/`, using the
   GitHub Copilot SDK. Add tools in `backend/app/agent/tools.py`; do not call model APIs directly.
2. **Agentic, not chat.** Prefer an agent that uses tools and renders UI blocks over a chat box.
   Never add complexity merely to look agentic.
3. **Generative UI.** Let the agent choose UI blocks via the `render_ui` tool. Add new block types
   in both `backend/app/agent/ui.py` and `frontend/src/blocks/` (see the registry).
4. **Synthetic data only.** Use and extend `/sample-data`. Mark new files as synthetic. Never
   introduce real patient data.
5. **Visible human control.** Clinical decisions appear as explicit human actions
   (approve / edit / dismiss). Show "why" and sources where the agent makes claims.
6. **Prototype disclaimer.** Keep the "Hackathon prototype – synthetic data – not for clinical use"
   notice visible.
7. **Look credible in the participant's working world.** Match the visual language to the user and
   task in the proposal instead of making every idea look like the same blue EHR.
   - Follow [`design-language.md`](design-language.md) in every mode: dark institutional chrome,
     cool neutral work surfaces, semantic `--cp-*` tokens, restrained accent, operational
     typography, explicit status, inspectable detail and visible human control. Reuse the token
     values rather than inventing an unrelated palette in each issue.
   - **Visible theme choice.** Put separate, labelled `Light` and `Dark` buttons in the persistent
     header or top-level controls. Show the selected theme with styling and `aria-pressed`; apply
     it to the complete workspace. Do not use only an icon or ambiguous single toggle.
   - For patient-level clinical workflows, default to `HospitalShell` from
     `frontend/src/hospital/HospitalShell.tsx` (hospital app bar, patient banner, left navigation,
     status bar) and its `Panel`, `DataTable`, `Tabs` and `Pill` pieces.
   - For research networks, trial operations, federated learning or other cross-hospital work, a
     purpose-built issue-local shell may fit better: for example a network canvas, evidence
     workspace or operations command centre. Give it a distinct visual identity that supports the
     concept. Do not modify shared `HospitalShell` components or other ideas to achieve it.
   - In either mode, keep it deliberately functional, dense and data-rich – not a startup landing
     page, generic dashboard template or decorative concept mock-up.
   - Consistency does not mean identical layouts. Vary the representation of the work – grids,
     structural edges, evidence views, maps or boards – while keeping the shared typography,
     controls, semantic colors, spacing and interaction rules.
   - **Lots of fake data.** Fill worklists, results, notes and histories so the screen feels like a
     real working day. Inspect `/sample-data` during UI generation: it includes a richer synthetic
     patient set and a hospital directory that can add credible site context when useful. Use only
     what fits the storyline; it is not required. Add inline synthetic rows (names, times, wards,
     sites, cohorts or trial signals) freely.
   - **Real-feeling interactions.** Clickable rows that open a chart, tabs, filters, acknowledge /
     approve / file-to-chart buttons that change state. They do not need a backend – local state is
     fine.
   - The AI assistant appears as one part of that screen (a panel, tab or side pane), not as the
     whole page. `frontend/src/ideas/starter/index.tsx` shows the clinical-shell pattern.
   - **Tell the story of the vision** (see `purpose-and-learnings.md` §1). Turn the issue into one
     concrete storyline and guide it with `StoryGuide` (`frontend/src/hospital/Story.tsx`) or an
     equally clear issue-local step treatment. Show out-of-sight work – hospitals queried, data
     matched, models trained, letters sent – with `Backstage` stages (spinners, counts, one-line
     explanations). Integrate the guide and backstage states into the shared design language rather
     than styling them as a separate tutorial overlay. Simulated timings and numbers are fine. End
     on the payoff screen.
   - **No doubt while waiting.** Every AI call or simulated process shows a spinner and a label
     at once – in the clicked button and in the result area (`Working` with elapsed seconds, or a
     running `Backstage` with `holdLast` until the AI answers). Never a frozen or empty screen.
8. **Demonstrable functionality over architecture.** No diagrams-as-deliverables, no speculative
   abstraction layers.
9. **No new infrastructure.** No databases, queues, extra services or containers. One container.
   File-based sample data is enough.
10. **Keep the existing stack**: FastAPI + uv, React + TypeScript + Vite.
11. **Must work without a Copilot token.** When the SDK is not configured, show a clear message and
    a meaningful demo path (for example the deterministic fallback), not a crash.
12. **Tests.** Add one small backend smoke test for new API or tool behaviour. Run
    `npm run lint` and `npm test` from the repository root before finishing.

## Capability manifest (required)

Create or update `capabilities/issue-<ISSUE_NUMBER>.md` from `capabilities/_template.md`. It
describes what this idea adds so an integration agent can later compose ideas semantically.

## Pull request description

Start with a short paragraph for the participant (no jargon), then list what was built, which
capabilities are demonstrated, and include `Fixes #<ISSUE_NUMBER>`.
