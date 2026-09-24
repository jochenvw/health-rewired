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
- Idea pages render full-bleed as **hospital software**: wrap them in `HospitalShell` from
  `src/hospital/HospitalShell.tsx` and use its `Panel`, `DataTable`, `Tabs`, `Pill` and `hx-btn`
  styles. Inside `.hx` the design tokens switch to a light clinical theme, so existing blocks adapt.
  Fill screens with plenty of synthetic data and working interactions (local state is fine).
- Tell the idea's story with `StoryGuide` (guided steps, pass as `guide` to `HospitalShell`) and
  `Backstage` (simulated behind-the-scenes stages) from `src/hospital/Story.tsx`.
- Every wait (AI call, simulated process, loading) shows a spinner and label immediately:
  a spinner in the clicked button plus `Working` or a running `Backstage` in the result area.
- The landing page keeps its own visual language: CSS variables from `src/styles.css`.
  No UI framework or CSS framework is needed; add one only with a strong reason.
- Keep the "Hackathon prototype – synthetic data – not for clinical use" notice visible.
- Human-in-the-loop actions (approve / edit / dismiss) must be explicit buttons, not implied.
- API calls go through `src/api.ts`. The dev server proxies `/api` to the backend on port 8000.
- Type check with `npm run lint --workspace frontend`; build with `npm run build --workspace frontend`.
