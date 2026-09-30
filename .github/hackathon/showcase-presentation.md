# Showcase presentation

How a finished prototype and architecture package become an audience-ready presentation.

This phase starts after the issue has label `architecture-ready`. The participant replies
`/presentation` on the idea issue. The workflow creates a downloadable PowerPoint; it does not
change the prototype or architecture.

After reviewing the first deck, the participant can reply `/presentation revise` followed by one
focused request, for example “make the patient impact clearer” or “simplify the architecture for a
non-technical audience”. The presentation editor turns that feedback into bounded slide-copy
overrides and the deterministic generator posts a new editable PowerPoint. Participants can keep
requesting focused revisions until they say the presentation is done.

## Audience story

The default deck is eight slides and should work as a seven-minute hackathon presentation:

1. **The biggest dream** – the idea in the participant's words.
2. **Why it matters** – the concrete clinical/research moment and what becomes possible.
3. **How we got here** – issue → coaching → prototype → feedback → architecture.
4. **The demo** – live screenshot, direct URL and QR code.
5. **What the prototype proved** – visible workflow, agent contribution and human decisions.
6. **Future Azure architecture** – a polished, simplified view of data boundaries, Azure platform
   capabilities and human governance.
7. **Well-Architected reality check** – the five Microsoft Azure Well-Architected pillars,
   expressed as decisions, risks and next validations rather than a numeric score.
8. **Path to the real world** – pilot → multi-site → production, ending with the next decisions.

## Visual direction

- Make the deck feel authored for European oncology innovation, not like a generic corporate
  template: warm ivory/sand, charcoal, terracotta/rust, amber and green, with Azure blue reserved
  for actual Azure platform elements.
- Use large statements, screenshots, timelines, diagrams and cards. Never produce slides that are
  only a title and bullet list.
- Keep the prototype screenshot and live-demo QR code prominent enough for an audience to scan.
- Redraw the architecture for presentation. Do not paste a dense Mermaid diagram onto a slide.
  Show the essential trust boundary, platform capabilities, information flow and human decisions.
- Keep detailed technical evidence in speaker-ready captions and concise tables; the audience
  should understand each slide from the back of the room.

## Content rules

- Use the original issue, implementation proposal, release comments and final architecture comment
  as sources. Do not invent outcomes or claim clinical validation.
- Distinguish clearly between **prototype evidence** and **future implementation assumptions**.
- Keep the hackathon prototype disclaimer on the demo slide.
- The architecture and delivery plan are starting points for discovery, security/privacy review,
  clinical safety work, cost modeling and formal Azure Well-Architected Review.
- The generated `.pptx` is editable. Participants should add presenter names, local context and any
  evidence collected during the event before presenting.
- Presentation revisions may shorten, refocus or clarify the audience story, but must not change
  clinical facts, claim validation, alter the live prototype or silently redesign the approved
  future architecture.
