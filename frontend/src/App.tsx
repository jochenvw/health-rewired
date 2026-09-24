import { useEffect, useState } from 'react';
import { api, type Status } from './api';
import { findIdea, ideas } from './ideas';

const repoUrl = 'https://github.com/jochenvw/health-rewired';
const newIdeaUrl = `${repoUrl}/issues/new?template=oncology-idea.yml`;

// Routes: `#/` is the landing page, `#/idea/<id>` is one idea page (id = issue number or "starter").
function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const route = useRoute();

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  const ideaId = route.startsWith('idea/') ? route.slice('idea/'.length) : null;
  const idea = ideaId ? findIdea(ideaId) : undefined;

  // Idea pages render full-bleed as hospital software; only a thin hackathon strip stays on top.
  if (idea) {
    return (
      <div className="idea-shell">
        <div className="idea-strip" role="note">
          <a href="#/">← All ideas</a>
          <strong>{idea.meta.title}</strong>
          <span className="idea-strip-tagline">{idea.meta.tagline}</span>
          <span className="idea-strip-note">
            Hackathon prototype · synthetic data
            {status?.preview_label ? ` · preview ${status.preview_label}` : ''}
          </span>
        </div>
        <idea.default />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="disclaimer" role="note">
        Hackathon prototype · synthetic data only · not for clinical use
        {status?.preview_label && <span className="preview-pill">Preview {status.preview_label}</span>}
      </div>

      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <div>
            <strong>Health Rewired</strong>
            <span>Oncology Hackathon 2026 · Munich</span>
          </div>
        </a>
        <nav aria-label="Main">
          <a href={newIdeaUrl} target="_blank" rel="noreferrer">
            Submit an idea
          </a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>
            Bring your oncology idea. <span className="accent">We'll build it.</span>
          </h1>
          <p className="lede">
            Describe it in a GitHub issue. An AI coach sharpens it with you, then GitHub Copilot builds a prototype
            you can click through.
          </p>
          {ideaId && <p className="note">That idea is not part of this version yet. Pick one below.</p>}
          <a className="button primary" href={newIdeaUrl} target="_blank" rel="noreferrer">
            Submit your idea on GitHub →
          </a>
        </section>

        <section aria-labelledby="ideas-title">
          <h2 id="ideas-title" className="section-title">
            Ideas
          </h2>
          <div className="idea-grid">
            {ideas.map(({ meta }) => (
              <a key={meta.id} className="idea-card" href={`#/idea/${meta.id}`}>
                {meta.issue && <span className="step-index">Idea #{meta.issue}</span>}
                <h3>{meta.title}</h3>
                <p>{meta.tagline}</p>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Health Rewired · Oncology Hackathon 2026 · Munich</span>
        <span>
          v{status?.version ?? '–'} · Copilot: {status?.copilot.auth_mode ?? 'unknown'}
        </span>
      </footer>
    </div>
  );
}
