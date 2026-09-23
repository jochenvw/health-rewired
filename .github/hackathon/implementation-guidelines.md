# Implementation guidelines

For the GitHub Copilot coding agent building an approved idea.

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
7. **Polished UI.** Reuse the design tokens in `frontend/src/styles.css`. Responsive. No
   developer-template look.
8. **Demonstrable functionality over architecture.** No diagrams-as-deliverables, no speculative
   abstraction layers.
9. **No new infrastructure.** No databases, queues, extra services or containers. One container.
   File-based sample data is enough.
10. **Keep the existing stack**: FastAPI + uv, React + TypeScript + Vite.
11. **Must work without a Copilot token.** When the SDK is not configured, show a clear message and
    a meaningful demo path (for example the deterministic fallback), not a crash.
12. **Tests.** Add or update a small backend test for new API or tool behaviour. Run
    `npm run lint` and `npm test` from the repository root before finishing.

## Capability manifest (required)

Create or update `capabilities/issue-<ISSUE_NUMBER>.md` from `capabilities/_template.md`. It
describes what this idea adds so an integration agent can later compose ideas semantically.

## Pull request description

Start with a short paragraph for the participant (no jargon), then list what was built, which
capabilities are demonstrated, and include `Fixes #<ISSUE_NUMBER>`.
