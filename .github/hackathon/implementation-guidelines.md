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
7. **Design freely for the proposal's audience and story.** There is no required design system,
   component library, theme mechanism or visual template. [`design-language.md`](design-language.md)
   is optional inspiration (tokens, `HospitalShell`, `StoryGuide`/`Backstage`, etc.) you may reuse
   in full, in part, or not at all — pick whatever look, palette, layout, components, motion and
   interaction style best tell this idea's story. The only things that matter:
   - **Lots of fake data.** Fill worklists, results, notes and histories so the screen feels like a
     real working day. `/sample-data` has a richer synthetic patient set and a hospital directory
     you can draw on if useful; use only what fits the storyline.
   - **Real-feeling interactions.** Clicking things should do something – open a chart, switch a
     tab, change a state. Local state is enough; no backend required for these.
   - **The AI assistant is part of the screen, not the whole page** (a panel, tab or side pane),
     powered by the Copilot SDK.
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
