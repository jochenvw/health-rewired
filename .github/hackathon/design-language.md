# Health Rewired design language

Adapted from the MDT Observatory design language. This is the shared visual and interaction
foundation for hackathon prototypes. It complements the clinical storyline in
[`purpose-and-learnings.md`](purpose-and-learnings.md): prototypes must still take the participant
on a guided tour through one concrete scenario.

For clinician- and operator-facing ideas, the default feel is a trusted institutional workstation:
calm, dense, inspectable and operational, not a generic collection of rounded cards. This default
is a starting point, not a mandate: an idea aimed at a different audience (patients, families, the
public, executives) or a genuinely different kind of tool may adopt a different tone — warmer,
simpler, more visual — as long as it stays legible, inspectable, accessible and specific to the
idea rather than a generic marketing page or chat window. When in doubt, prefer a distinctive,
credible workspace over either a decorative consumer dashboard or a carbon-copy EHR shell.

## 1. Design signature

The recognizable combination below is the **default signature** for clinician/operator workstation
ideas. Ideas with a different audience may depart from it (see above); keep the parts that still
apply (semantic status colors, visible human control, layered disclosure) even when the chrome,
palette or density change.

1. **Dark institutional chrome** frames the product and establishes place, workstation and system
   state.
2. **Cool neutral work surfaces** keep information dense without feeling visually heavy.
3. **One restrained accent** identifies primary actions and selected state.
4. **Semantic status colors** communicate success, warning, failure and links; they never decorate.
5. **Small monospaced labels** provide operational hierarchy above plain-language headings.
6. **Layered disclosure** keeps the active decision visible while evidence, provenance and full
   records remain one action away.
7. **Distinct workspaces** change information structure, borders and emphasis while retaining the
   same tokens and controls.
8. **Visible human control** makes review, uncertainty, failure and provenance first-class
   interface elements.

The system's character comes from hierarchy and restraint more than illustration, gradients or
animation. Consistency means shared foundations, not identical screens.

## 2. Principles

### Make state legible

Every screen should answer:

- Where am I?
- What object, patient, case or cohort am I working on?
- What is happening now?
- What needs attention?
- What can I inspect?
- What can I do next?

Use persistent chrome, a contextual banner, an attention strip and explicit action labels. Do not
rely on color alone.

### Put the current task before the full record

The primary canvas contains the active assessment, activity and human controls. Supporting material
belongs in contextual rails, expandable sections and inspection drawers:

```text
system and location
  -> current object
    -> current task and state
      -> supporting summary
        -> full record, evidence and provenance
```

### Prefer inspectability over apparent simplicity

Complexity is not hidden; it is staged. A compact summary should lead to the underlying record,
source or rationale.

### Use visual variation to express work

Patient care, research networks, trial operations and laboratory work may use different grids,
border treatments and information structures. They must not introduce independent component
libraries, typography or color systems.

### Keep operational and domain information separate

User-facing panels describe the work, findings, uncertainty and required action. Provider metadata,
request details and technical telemetry belong in audit or diagnostic surfaces.

## 3. Foundations

These foundations are the **shared default**, tuned for clinician/operator workstations. Treat them
as a strong starting point to adapt, not a fixed spec to copy verbatim: an idea may introduce its
own palette, type scale or spacing rhythm when its audience or content genuinely calls for it,
provided the result stays internally consistent, accessible (contrast, focus states, text labels)
and still follows the principles in section 2 (legible state, layered disclosure, inspectability).

### Typography

Use system fonts so the application feels native to an enterprise workstation and has no web-font
dependency. This is the default; an idea that is not an enterprise workstation (e.g. something
patient-facing) may choose a different, still-accessible font stack.

```css
--font-sans: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: Consolas, "Courier New", Courier, monospace;
```

| Element | Treatment |
|---|---|
| Body | 14 px, relaxed line height, regular weight |
| Page title | 30 px, semibold, tight tracking |
| Section title | 20 px, semibold |
| Card title | 16 px, semibold |
| Body detail | 12-14 px, 24-28 px line height |
| Eyebrow / operational label | 10 px, monospaced, uppercase, wide tracking |
| Metadata | 9-11 px, muted |

Headings are sentence case. Uppercase is reserved for short operational labels, not prose.

### Color tokens

Use semantic tokens rather than literal colors. These tokens are the shared baseline for clinical
and purpose-built workspaces — reuse them whenever an idea fits the default institutional tone.
Semantic colors (success, warning, danger, link) should keep their meaning across the app so status
stays legible, but the exact palette, including the accent, may be re-themed per idea when the
tone calls for it (e.g. a patient-facing or public-facing idea choosing a friendlier hue).

| Token | Light | Dark | Purpose |
|---|---:|---:|---|
| `--cp-bg` | `#eef2f5` | `#2b3238` | Application canvas |
| `--cp-bg-elevated` | `#f8fafb` | `#242a30` | Recessed or supporting region |
| `--cp-surface` | `#ffffff` | `#1f2429` | Primary surface |
| `--cp-surface-soft` | `#f3f6f8` | `#262c32` | Hover and secondary surface |
| `--cp-border` | `#d8dfe5` | `#3f4953` | Default divider |
| `--cp-border-strong` | `#919191` | `#5f5f5f` | Strong structure |
| `--cp-text` | `#242424` | `#dedede` | Primary text |
| `--cp-text-muted` | `#5c5c5c` | `#919191` | Secondary text |
| `--cp-text-soft` | `#6f6f6f` | `#b0b0b0` | Labels and metadata |
| `--cp-chrome` | `#10304d` | `#0b1a29` | Institutional header |
| `--cp-chrome-fg` | `#eaf2f8` | `#dbe7f1` | Header foreground |
| `--cp-chrome-muted` | `#a9c0d4` | `#8ea6ba` | Header metadata |
| `--cp-banner` | `#e2ebf2` | `#1a2733` | Context banner |
| `--cp-accent` | `#b11f4b` | `#fd8ea1` | Primary action and selection |
| `--cp-accent-hover` | `#9a1a41` | `#fb7b91` | Primary hover |
| `--cp-accent-soft` | `rgba(177,31,75,.08)` | `rgba(253,142,161,.14)` | Selected region |
| `--cp-success` | `#16a34a` | `#4ade80` | Completed or supported |
| `--cp-warning` | `#f59e0b` | `#fbbf24` | Conditional or unresolved |
| `--cp-danger` | `#dc2626` | `#f87171` | Failure or blocking state |
| `--cp-link` | `#0078d4` | `#4da6ff` | Links and information |

Navy belongs to system chrome. Burgundy or pink is the default product accent. Green, amber and red
retain fixed semantic meaning. If a proposal requires another orientation color, keep it separate
from status colors and retain the rest of the system.

### Surfaces, borders and spacing

- Application background: cool grey, never pure white.
- Primary content: white or charcoal surfaces.
- Default border: 1 px neutral; use a 2-8 px edge for structural emphasis.
- Cards: 16 px radius; inputs and primary buttons: 12 px; compact controls: 6-8 px.
- Reserve large soft shadows for drawers and temporary overlays.
- Avoid cards nested inside cards without a real change in information depth.
- Use the spacing scale `4 8 12 16 20 24 32 px`.
- Density comes from structure, not cramped prose.

### Iconography

Use one outlined icon family, preferably Lucide: 14-18 px for controls and metadata, 18-21 px for
navigation and 28 px for workspace emblems. Icons support a text label or familiar control; they do
not decorate.

## 4. Page anatomy

A full application screen follows this stack:

```text
prototype / synthetic-data strip
institutional header
context banner
sidebar + main canvas
  guided story / page toolbar
  attention and error state
  current task
  supporting context
inspection drawers and modals
```

### Institutional header

The header establishes product identity, organization, location, system state and global controls.
Use navy chrome, a compact high-information layout and a minimum height around 56 px:

```text
[mark] PRODUCT / MODULE
       Organization · Department

Location · Workstation        Time    Connection    Global controls
```

### Context banner

Identify the current patient, case, cohort, site or other object with a leading identity block,
three to five high-value facts and an action to open the complete record. Show recorded synthetic
data only; omit or explicitly label missing fields.

### Sidebar and main canvas

- The sidebar is a persistent workspace map, not a second command bar.
- Keep primary workspaces first and specialist or functional workspaces grouped below.
- Make the current state visible in a short detail line.
- On small screens, use a temporary panel opened from the header.
- Keep the canvas bounded, with 12 px mobile, 24 px tablet and 32 px wide-screen padding.
- Collapse grids before information becomes narrow.

### Inspection drawer

Use a right-side drawer for evidence, provenance, complete records and detailed assessments. It
needs an explicit close control, Escape handling, focus restoration and a clear heading such as
`INSPECTABLE BY DESIGN`.

## 5. Core components

### Eyebrow

A small monospaced operational label explains the role of a section:

```text
CURRENT CONCLUSION
HUMAN REVIEW REQUIRED
CLAIM -> SOURCE
```

Keep it short and use it to orient, not decorate.

### Panels, buttons and statuses

- Cards group related work; panels add standard 20-24 px content padding.
- Use one local primary action, normal reversible secondary actions, low-emphasis text actions and
  accessible icon actions.
- Use specific labels such as `Send query to hospitals` or `Open original source`, not `Continue`.
- Destructive actions use explicit danger treatment, never the product accent.
- Status badges always include text. Only genuinely running work pulses.

### Attention and blocking states

Place an attention strip near the top of a workspace with a 4 px semantic edge, status badge and
one plain-language explanation. When progress depends on a person, show who is needed, what unlocks
the next step and one action that focuses the required input. Keep the block visible until it is
genuinely resolved.

### Guided story and backstage work

`StoryGuide` and `Backstage` are part of the design language, not optional demo decoration:

- three to six numbered, plain-language stages;
- one sentence explaining what the current stage means;
- a specific next action;
- visible live work, counts and state changes;
- an immediate spinner and label for every wait;
- a final payoff that resolves the story.

The guide should look integrated with the institutional chrome and semantic tokens. It must not
float above the application as an unrelated tutorial widget.

### Reasoning path

Present the agent's public account as a bounded sequence:

1. Trying to answer
2. Considered
3. This showed
4. But this remains uncertain
5. So the current conclusion is
6. Next

Label it as a public summary, never private model deliberation. Link to evidence or the full
assessment where appropriate.

### Data, activity and disclosure

- Use definition lists to inspect one record and tables to compare records.
- Activity streams show the domain action, finding or failure, not request IDs or model metadata.
- Use native `details` and `summary` for optional supporting records.
- Alerts use visible borders, semantic text and actionable language.
- Forms keep labels associated, examples in placeholders and a visible receipt after submission.

## 6. Workspace variation

Shared chrome, controls, typography and semantic colors remain fixed. A workspace may vary its page
tint, grid proportions, structural edge, emblem, restrained monospace use and representation of
the work.

| Workspace character | Structural treatment |
|---|---|
| Patient-level care | Institutional shell, patient banner, dense record and decision panels |
| Image comparison | Dark high-contrast header, blue orientation color, wide visual column |
| Treatment and tolerability | Accent-tinted canvas, three-column board, rounded header |
| Procedural planning | Green orientation edge, planning facts beside a larger canvas |
| Tissue / laboratory report | Squared report treatment, strong rules, more monospace |
| Research evidence | Table-led layout, square edges, source emphasis |
| Trial or cohort operations | Operational map or board, site status, counts and handoffs |
| Conditional pathway | Amber orientation edge and explicit eligibility conditions |
| Human preferences | Softer centered composition and narrower maximum width |

The reuse rule is: **vary the representation of the work to fit the idea and its audience**. Keep
semantic meaning consistent (status colors never flip meaning, orientation colors never imply
approval) and keep the result inspectable and accessible — beyond that, palette, grid and tone are
free to adapt, including departing from the institutional-workstation look entirely when the
audience genuinely isn't a clinician at a desk.

## 7. Content design

Interface language is plain, direct, specific, operational and honest about uncertainty.

Prefer:

```text
Connection interrupted. Reconnecting; your input is preserved.
Full text has not been retrieved.
Tell me what you reviewed and found.
```

Avoid:

```text
Something went wrong.
AI insights ready.
Proceed with confidence.
```

Name the work and actor precisely: `Review activity`, `Human review required`, `Evidence
applicability`, `Open complete record`. Do not use intelligence-themed labels where an ordinary
work label is clearer.

Uncertainty is a content type, not a footer disclaimer. Claims should expose a chain such as
`claim -> evidence -> source -> scrutiny`. Keep access limitations, incomplete records and failed
retrieval visible beside affected information.

## 8. Motion

Motion should earn its place: use it to make real activity, state changes and staged progress
(e.g. a "searching participating hospitals…" sequence) understandable, not as decoration. Never
delay controls, state, errors or critical information for animation. Disable non-essential motion
under `prefers-reduced-motion: reduce`; keep pulsing/looping animation limited to genuinely active
work so it doesn't mislead the viewer.

## 9. Theme and accessibility

Every idea page must support light and dark presentation and expose two plainly labelled controls:
`Light` and `Dark`.

- Place both buttons in the institutional header or another persistent top-level control area.
- Do not replace them with an unlabeled sun/moon icon or one ambiguous toggle.
- Show the active choice visually and with `aria-pressed`.
- Apply the choice to the complete idea workspace, including chrome, guide, backstage states,
  drawers and generated blocks.
- Persist the choice for the next visit where practical.
- A system preference may choose the initial value, but the visible `Light` and `Dark` buttons must
  always remain available.
- Apply the initial theme before paint where practical to avoid a flash of the wrong theme.

The visual identity depends on accessible behavior:

- a keyboard-focusable skip link;
- accessible names for icon-only controls;
- a visible 2 px accent focus outline with 4 px offset;
- textual status, never color alone;
- logical heading hierarchy and table captions;
- focus-managed drawers;
- responsive layouts that preserve task order;
- reduced-motion support;
- touch targets normally at least 36-40 px high.

## 10. What stays issue-specific

Do not copy product-specific clinical content from MDT Observatory:

- organization, hospital and department names;
- patient-banner fields that do not fit the idea;
- clinical role names and icons;
- the exact workspace topology;
- safety wording beyond this repository's required prototype disclaimer.

Retain their functions: institutional context, current-object identity, explicit environment status,
clear workspace orientation and visible human control.

## 11. Adoption checklist

For every new idea:

1. Start from the semantic tokens, typography, spacing, radii and border hierarchy, and adapt
   them when the idea's audience or tone genuinely calls for something different.
2. Use `HospitalShell` for patient-level care if that fits, or build an issue-local shell —
   institutional, consumer-friendly or otherwise — that fits the idea's audience.
3. Establish institutional chrome, current-object context and a bounded task canvas.
4. Use the core patterns: eyebrow, panel, actions, statuses, attention, activity, disclosure and
   inspection.
5. Keep `StoryGuide` and `Backstage` visually integrated and make the full storyline navigable.
6. Separate workspace orientation from semantic state.
7. Make evidence, source data or provenance reachable from consequential summaries.
8. Preserve keyboard focus, responsive task order, textual status and reduced motion.
9. Include visible `Light` and `Dark` buttons and check the complete walkthrough in both themes.
10. Check the result at mobile and wide-desktop widths.

Do not begin by cloning a screen. Apply the tokens and primitives, then vary the workspace structure
to express the participant's work.
