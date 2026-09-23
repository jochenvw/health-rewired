# Oncology Hackathon 2026 — Munich

This repository is a deliberately simple but polished starter for the Oncology Hackathon 2026 in Munich. It is designed for participants who are not professional software engineers and for coding agents that need a clean, agent-friendly way to turn oncology ideas into working prototypes.

The application is a canvas, not a solution. It gives each team a strong starting point: clear branding, a clean product shell, a working agent example, and a repeatable structure for issue-driven development.

## What this repo includes

- A polished landing page branding the hackathon and framing the idea space
- A Python 3.11+ FastAPI backend
- A React + TypeScript frontend with a modern, lightweight build
- A GitHub Copilot SDK example that demonstrates how an app can invoke an agentic workflow
- A Dockerfile for a single-container deployment
- Issue templates and documentation for the hackathon flow

## Local development

### 1) Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

The frontend is configured to proxy `/api` requests to the backend.

## Production-style container

```bash
docker build -t oncology-hackathon .
docker run --rm -p 8000:8000 oncology-hackathon
```

The app serves the built frontend and exposes the API on the same container.

## Why this design

This project is intentionally narrow: one app, one container, one discovery path. The important part is not the medical domain logic itself. The important part is the environment that supports fast experimentation, issue-driven refinement, and agent-assisted product development.

## Agentic development flow

1. A participant opens a GitHub issue describing an oncology idea.
2. The issue is reviewed and refined with an agentic coach.
3. The idea becomes actionable and sufficiently ambitious.
4. A coding agent implements the prototype in a PR.
5. The app is previewed in a unique environment.

## Generative UI pattern

The app is structured so AI can influence not just chat output but also UI composition. The backend exposes structured coaching output, and the frontend is built to render cards, alerts, evidence panels, and workflow steps dynamically.

This creates an extension path for future participants to move beyond a chatbot and toward adaptive software experiences.
