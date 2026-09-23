# Agentic workflow for participants

This project is intentionally designed around GitHub Issues as the primary interface for product discovery.

## Recommended flow

1. A participant describes the problem and the desired outcome in a GitHub issue.
2. A coding agent reviews the idea for oncology relevance and progressive thinking.
3. The participant and agent refine the problem statement together.
4. The agent produces an implementation brief, risks, and a minimal architecture.
5. A pull request contains the working prototype.
6. Deployment and previews are surfaced back into the issue and repository context.

## Key design choice

The repository keeps the app simple on purpose. That means each team can focus on the ideas, not on infrastructure. The backend exposes structured coaching endpoints, and the frontend is ready for adaptive UI composition when new ideas require it.

## Extending the system

The repo intentionally separates concerns:

- backend: orchestration, agent calls, and API contracts
- frontend: dynamic rendering, validation, and visual exploration
- issue template: problem framing for the next step of the workflow

This makes it easy to add more tools, more agents, or a richer UI without redesigning the architecture.
