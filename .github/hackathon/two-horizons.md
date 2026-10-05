# Two horizons: in six months, and the moonshot

Every idea is built in **two versions on the same screen**, behind one visible switch:
**"In six months"** and **"Moonshot"**. Read this before coaching, building or reviewing.

## Why

The moonshot shows where we want to go: what becomes possible when every hospital is connected and
agents can do real work. But the hackathon must also produce a first step that hospitals can take
within about six months. Without it, the moonshot stays a nice demo and the work packages stay
vague. The six-month version is what turns the idea into concrete work.

## The "In six months" version

Realistic with what exists today. It answers three questions, visibly on screen:

1. **What can we already do?** Start from the minimum dataset for colorectal cancer that UMC Utrecht
   already defined: [`/sample-data/minimum-dataset-crc.md`](../../sample-data/minimum-dataset-crc.md).
   Name the dataset items the idea uses. Prefer existing systems, existing exports and people doing
   one step by hand over new infrastructure.
2. **What must each hospital provide?** Per hospital (use `/sample-data/hospitals.csv` for
   credible sites): which items it must deliver, from which system, how often, and who does it.
   Show this as a small, honest readiness view, for example "available · partly · not yet".
3. **How much does this already solve?** Show coverage plainly: which part of the problem is solved
   with these items alone, and what is still missing. Simulated counts are fine; label them.

Keep the six-month version modest and believable. No new national infrastructure, no cross-border
automation that does not exist yet. A human may do steps that an agent does in the moonshot.

## The "Moonshot" version

Assume a trusted federated foundation exists: every hospital connected, data stays at the source,
agents can retrieve, check and prepare. This is the existing hackathon ambition
([`guardrails.md`](guardrails.md) §3, [`progressive-ai.md`](progressive-ai.md)).

## How the two connect

- Same use case, same user, same storyline. The switch changes **what is possible**, not the topic.
- Make the difference visible: what the moonshot adds, and which dataset items or hospital steps
  the six-month version depends on.
- The six-month version feeds the first work packages; the moonshot sets the direction for the
  later ones (see [`architecture-coaching.md`](architecture-coaching.md)).

## For the idea coach

- If the participant described only one horizon, propose the other one yourself in the
  implementation proposal. Do not block an idea because the six-month version is missing; at most
  ask one question about it.
- If the idea is outside colorectal cancer, still use the minimum dataset as an example of the kind
  of items needed, and say which items would differ for that tumour type.
