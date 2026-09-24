---
applyTo: "frontend/**"
---

# Frontend (React + TypeScript + Vite)

- Pages: `src/App.tsx` is the landing page (list of ideas) and a tiny hash router. **Each idea is a
  folder** `src/ideas/issue-<N>/index.tsx` exporting `meta` and a default component; it is
  discovered via `import.meta.glob` and opens at `/#/idea/<N>`. Do not edit `App.tsx` for an idea.
- Generative UI: the backend returns `blocks: UIBlock[]`. `frontend/src/blocks/registry.tsx` maps
  each `type` to a component. To add a block type: create `frontend/src/blocks/<Name>Block.tsx`,
  register it, and add the same type to `backend/app/agent/ui.py`. Unknown types must degrade
  gracefully (the registry already falls back to a generic card).
- Idea pages render full-bleed as **credible working software for the participant's role**.
  Clinical patient workflows should use `HospitalShell` from `src/hospital/HospitalShell.tsx`
  with its `Panel`, `DataTable`, `Tabs`, `Pill` and `hx-btn` styles. Research networks, trial
  operations and Europe-wide learning systems may use a purpose-built, issue-local shell when the
  proposal calls for it. Keep it dense, functional and data-rich rather than a marketing page, and
  do not change shared shell styles to achieve an idea-specific look.
- Tell the idea's story with `StoryGuide` and `Backstage` from `src/hospital/Story.tsx`, or an
  equally clear issue-local guided-step treatment when using a purpose-built shell.
- Every wait (AI call, simulated process, loading) shows a spinner and label immediately:
  a spinner in the clicked button plus `Working` or a running `Backstage` in the result area.
- The landing page keeps its own visual language: CSS variables from `src/styles.css`.
  No UI framework or CSS framework is needed; add one only with a strong reason.
- Keep the "Hackathon prototype – synthetic data – not for clinical use" notice visible.
- Human-in-the-loop actions (approve / edit / dismiss) must be explicit buttons, not implied.
- API calls go through `src/api.ts`. The dev server proxies `/api` to the backend on port 8000.
- Type check with `npm run lint --workspace frontend`; build with `npm run build --workspace frontend`.
