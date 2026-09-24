# Implementation guidelines

For the GitHub Copilot coding agent building an approved idea.

## Hackathon mindset (read first)

This is a hackathon. You are building a **prototype** that non-technical medical professionals will
click through, react to, and iterate on with you. Speed to something visible beats completeness.

- **Bias to action.** Build the smallest version that shows the proposal's walkthrough end to end,
  then stop. Participants refine it afterwards by commenting `@copilot` on the pull request.
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
2. Read [`capability-cards.md`](capability-cards.md) for the capabilities the proposal names.
3. Read `README.md` → "Extending the app" for where code goes.

## Build rules

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
7. **Polished enough to demo.** Reuse the design tokens in `frontend/src/styles.css`. It should look
   intentional, not like a developer template – but do not gold-plate.
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
