# Two horizons: in six months, and the future (optional)

This is optional guidance, not a requirement. An idea may choose to show **two versions of the
same idea**, but there is no required switch, control or specific UI for it — use whatever
presentation fits the idea, or skip this entirely.

| | **In six months** | **The future** |
|---|---|---|
| Assumes | Only the minimal tumour-board dataset, delivered by each hospital | The full European federated oncology platform |
| Shows | What already works, and what is greyed out because it needs more | The full vision (as before) |
| Answers | "What can we really do next spring, and what does it ask of each hospital?" | "What does the platform make possible?" |

Why: the future version creates the enthusiasm; the six-month version creates the commitment.
Hospitals and funders need to see that the first step is small, concrete and already useful.

## The minimal dataset

[`/sample-data/minimal-mdt-dataset.json`](../../sample-data/minimal-mdt-dataset.json) is the
working list from the UMC Utrecht team for colorectal cancer tumour boards: about 100 elements in
groups (patient, tumour, pathology, molecular, treatment, labs, tumour board, follow-up, quality
indicators), each marked as recorded once or repeatedly, plus the medical summary a clinician expects.

Each element has a `likely_source`: `structured`, `report text`, `MDT form`, `patient / clinic note`
or `derived`. This is a hackathon assumption about where it usually lives today, not a measurement.
Say so on screen.

The list covers colorectal cancer. For other tumour types, the generic elements (patient, labs,
tumour board, treatment, follow-up) carry over; tumour-specific pathology and molecular elements are
not defined yet. Show that honestly rather than inventing a list.

## What "in six months" means

Assume, six months from now:

- every participating hospital delivers the minimal dataset for its colorectal patients, kept in
  the hospital, mapped once to an agreed format;
- `structured` and `derived` elements are available reliably;
- `report text` and `MDT form` elements are available where the hospital has started structuring
  them, so expect gaps and show them;
- `patient / clinic note` elements are often missing;
- approved, simple questions can be answered across hospitals as counts or aggregates, not as live
  patient-level queries during a consultation;
- nothing in `not_in_minimal_dataset` exists yet: no images, no live cross-hospital querying, no
  model training across hospitals, no write-back into hospital systems.

## How the prototype could show it (optional, pick any presentation)

1. **If you add a switch, keep it simple.** A clearly labelled control, for example `In six months`
   and `The future`. Not required — any way of presenting both horizons (or just one) is fine.
2. **Same storyline, same patient.** Both horizons walk the same steps. In six months, a step that
   depends on something outside the minimal dataset is shown greyed out with a short label: "Needs
   live hospital queries – not in six months". Do not delete steps; the gaps are the message.
3. **Coverage panel.** In six months, show a compact panel "What this needs from the minimal
   dataset": the elements the idea uses, grouped, each with its `likely_source` and a tick, a
   half-tick or a cross. Above it one plain sentence, for example "18 of 24 elements this idea uses
   are in the minimal dataset; 7 of those are usually free text today."
4. **What each hospital must do.** A short list derived from the elements used: which fields to
   map, which reports to start structuring, which tumour-board fields to record in a fixed form, and
   which agreements are needed. Keep it to what this idea needs, in plain language.
5. **Payoff in both horizons.** Six months ends on a smaller but real result ("the tumour board
   sees a complete summary and the three missing items, for every colorectal patient in four
   hospitals"). The future ends on the full vision.
6. **Simulated, and labelled.** Counts, percentages and hospital readiness are simulated from the
   synthetic data and the dataset file. Label them as such.

## For the idea coach

Add a section to the implementation proposal (see [`coaching.md`](coaching.md)): what the idea can
already do in six months with only the minimal dataset, what is missing, and what that asks of each
hospital. Base it on the participant's answer to "What could already work in six months?" when it
is filled in; otherwise propose it yourself in two or three sentences.

## For the backpropagation coach

The six-month version is the first candidate work package: delivering and using the minimal
dataset for this idea. Other packages close the gap between six months and the future.
