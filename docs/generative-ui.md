# Generative UI direction

The frontend is structured to accommodate AI-generated or AI-influenced layouts without locking the app into a chat-only pattern.

## Current pattern

The app keeps a simple state model:

- a short idea input
- a structured output from the coaching endpoint
- cards that render the resulting plan, risks, and action items

This makes it easy to evolve into adaptive interface compositions such as:

- patient-summary cards
- evidence panels
- timelines
- alerts
- decision-support views
- structured forms

## Why not a full framework from day one?

A large UI framework would add complexity for a starting project with many non-developers. Instead, the repo uses a minimal React + TypeScript setup that is easy to extend. This is the smallest design that still makes AI-driven UI composition obvious.

## Extension points

Future teams can add:

- tool-generated cards from backend schemas
- branch-specific visual states
- dynamic form generation for clinical workflows
- AI-selected layouts based on the problem domain

The important architecture choice is that the backend already returns structured data, not only text.
