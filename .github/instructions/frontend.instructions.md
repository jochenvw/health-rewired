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
- Keep the visual language: use CSS variables from `src/styles.css` (`--accent`, `--surface`, …).
  No UI framework or CSS framework is needed; add one only with a strong reason.
- Keep the "Hackathon prototype – synthetic data – not for clinical use" notice visible.
- Human-in-the-loop actions (approve / edit / dismiss) must be explicit buttons, not implied.
- API calls go through `src/api.ts`. The dev server proxies `/api` to the backend on port 8000.
- Type check with `npm run lint --workspace frontend`; build with `npm run build --workspace frontend`.
