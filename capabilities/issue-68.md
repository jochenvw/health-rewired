---
issue: 68
title: "Is the patient ready for the tumour board?"
users: [coordinator]
capabilities: [proactive-agents, tool-use, generative-ui, human-in-the-loop, role-specific-agents]
ui_surfaces: ["/#/idea/68"]
api_endpoints: ["GET /api/ideas/68/board", "POST /api/ideas/68/review"]
agent_tools: ["get_board_readiness", "render_ui"]
data: ["sample-data/issue-68-board.json"]
depends_on: []
---

# Is the patient ready for the tumour board?

## Problem addressed
Missing results postpone colorectal tumour board decisions. Coordinators currently check several systems by hand.

## Users
The coordinator preparing next week's colorectal board.

## Capability
A five-patient worklist flags missing and outdated results on opening, ranks gaps first, and links each flag to the synthetic source and illustrative requirement.

## Agent behaviour
The shared Copilot SDK runner uses the read-only `get_board_readiness` tool to inspect pathology, staging, CEA and MSI/MMR, explain gaps, suggest teams, and render evidence and reminder drafts. A labelled deterministic fallback covers unconfigured or unavailable SDK access.

## Inputs
Synthetic board records, a fixed October 2026 demo week, illustrative freshness rules, and the selected patient.

## Outputs
Readiness ticks/crosses, source evidence, editable reminders, simulated approval receipts, and a coordinator-reviewed agenda.

## Human decisions
The coordinator edits and approves each simulated request and independently keeps or postpones each patient. Requests never turn missing results into available ones. No messages are sent; no treatment is recommended.

## Dependencies
Shared HospitalShell, StoryGuide, Backstage, UI block registry, sample-data loader and Copilot SDK runner. No new infrastructure or packages.

## Major assumptions
The checklist and freshness windows are illustrative—not clinical guidance. Real deployment would need locally agreed criteria and hospital source connections. Agenda decisions and approvals are local session state and reset on reload.
