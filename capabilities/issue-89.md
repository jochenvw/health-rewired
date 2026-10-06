---
issue: 89
title: "Zero trust for oncology assistants"
users: [information-security-officer, privacy-officer, clinician]
capabilities: [agentic-workflows, proactive-agents, human-in-the-loop, tool-use, generative-ui]
ui_surfaces: ["/#/idea/89"]
api_endpoints: ["POST /api/ideas/89/review"]
agent_tools: [inspect_access_decision]
data: ["sample-data/patients/P-003.json", "sample-data/patients/P-004.json", "sample-data/patients/P-005.json", "sample-data/minimal-mdt-dataset.json"]
depends_on: []
---

# Zero trust for oncology assistants

## Problem addressed
An officer needs to see why a tumour-board assistant reads a record and stop an assistant that exceeds its purpose.

## Users
Information Security Officer on the Monday before the weekly colorectal tumour board.

## Capability
A guided synthetic console checks each demo request against one local rule set, exposes the decision log, and demonstrates short-lived scoped access and suspension.

## Agent behaviour
Fixed rules grant four fields for one listed case, quarantine a scripted malicious note, and deny off-list or bulk requests. The Copilot SDK supervisor uses a read-only decision tool and renders explanations; it has no patient-data tools. Token-free mode supplies a labelled deterministic explanation.

## Inputs
Synthetic board list and treatment relationships; age, sex, diagnosis date and cTNM from sample records and the minimal dataset.

## Outputs
Inspectable decisions, a four-field read, 15-minute demo grant, quarantine alert, bulk anomaly demonstration and visible suspension.

## Human decisions
The officer controls suspension and records review. Policy ownership, exceptions and incident response remain human; real policy editing and notification workflows are deferred.

## Dependencies
Shared SDK runner, block renderer, StoryGuide and Backstage. Audit-trail and automated-access ideas are future integrations, not current dependencies.

## Major assumptions
This is not real authorisation: no credentials are issued, and the browser's session log resets with the demo. Suspension only controls this synthetic walkthrough. Hospitals must supply reliable board membership and treatment relationships separately from the minimal dataset. Six-month mode supports local decisions but not whole-document or cross-system supervision. Future federated anomaly detection is simulated.
