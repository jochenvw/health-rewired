import { FormEvent, useState } from 'react';

type CoachWidget = {
  kind?: string;
  title?: string;
  body?: string;
  meta?: string;
};

type CoachResponse = {
  status?: string;
  title?: string;
  summary?: string;
  next_steps?: string[];
  evidence?: string[];
  widgets?: CoachWidget[];
  sdk_status?: string;
};

const starterIdeas = [
  'A decision-support tool that matches cancer patients to the most relevant clinical trials based on tumor biology, comorbidities, and access constraints.',
  'A patient navigation assistant that helps oncology teams spot treatment delays, side-effect risk, and care coordination gaps early.',
  'A research workspace that turns fragmented evidence into a structured oncology timeline for new treatment options.',
];

const defaultResponse: CoachResponse = {
  status: 'idle',
  title: 'Idea brief',
  summary: 'Describe an oncology concept and the app will turn it into a sharper, more actionable problem statement.',
  next_steps: ['Clarify the user problem.', 'Surface the clinical context.', 'Define a prototype with measurable value.'],
  evidence: ['This is a starting canvas, not a solved problem.', 'The goal is to produce a clear next step for a hackathon prototype.'],
  sdk_status: 'ready to coach',
};

export default function App() {
  const [idea, setIdea] = useState(starterIdeas[0]);
  const [feedback, setFeedback] = useState<CoachResponse>(defaultResponse);
  const [loading, setLoading] = useState(false);

  const widgetCards = feedback.widgets && feedback.widgets.length > 0 ? feedback.widgets : [
    { kind: 'summary', title: 'Summary', body: feedback.summary || '', meta: 'Coach' },
    { kind: 'action', title: 'Next steps', body: (feedback.next_steps || [])[0] || '', meta: 'Workflow' },
    { kind: 'alert', title: 'Evidence', body: (feedback.evidence || [])[0] || '', meta: 'Relevance' },
  ];

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });

      const data = (await response.json()) as CoachResponse;
      setFeedback(data || defaultResponse);
    } catch {
      setFeedback({
        ...defaultResponse,
        status: 'fallback',
        summary: 'The backend could not be reached. Use the starter brief and refine the idea locally.',
        sdk_status: 'offline',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">Oncology Hackathon 2026</span>
          <h1>Munich</h1>
        </div>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#concept">Concept</a>
          <a href="#workflow">Workflow</a>
          <a href="#agent">Agent</a>
        </nav>
      </header>

      <main className="hero-grid">
        <section className="hero-copy" id="concept">
          <p className="kicker">Starting canvas for bold oncology ideas</p>
          <h2>Turn promising concepts into prototypes that move the field.</h2>
          <p className="lede">
            This repository is not a finished medical product. It is the clean beginning for
            hackathon teams to turn early oncology ideas into testable, ambitious prototypes.
          </p>
          <div className="cta-row">
            <a href="#agent" className="primary-button">Explore the agent</a>
            <a href="#workflow" className="secondary-button">See the workflow</a>
          </div>
        </section>

        <aside className="hero-panel" id="agent">
          <div className="panel-header">
            <span className="status-dot" />
            <span>Idea coach</span>
          </div>

          <form onSubmit={handleSubmit} className="idea-form">
            <label htmlFor="idea-input">Describe your oncology concept</label>
            <textarea
              id="idea-input"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={8}
            />

            <div className="chip-row" aria-label="Example ideas">
              {starterIdeas.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="chip"
                  onClick={() => setIdea(example)}
                >
                  Example
                </button>
              ))}
            </div>

            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? 'Coaching…' : 'Generate brief'}
            </button>
          </form>
        </aside>
      </main>

      <section className="output-panel" aria-live="polite">
        <div className="panel-heading">
          <span className="eyebrow soft">Agent output</span>
          <h3>{feedback.title || 'Idea brief'}</h3>
        </div>

        <div className="result-grid">
          {widgetCards.map((widget) => (
            <div key={`${widget.kind}-${widget.title}-${widget.meta}`} className={`result-card ${widget.kind || 'summary'}`}>
              <span className="widget-tag">{widget.meta || 'Layer'}</span>
              <h4>{widget.title}</h4>
              <p>{widget.body}</p>
            </div>
          ))}
        </div>

        <div className="meta-row">
          <span className="meta-pill">Status: {feedback.status || 'idle'}</span>
          <span className="meta-pill">SDK: {feedback.sdk_status || 'unknown'}</span>
        </div>
      </section>

      <section className="feature-grid" id="workflow">
        <article className="feature-card">
          <span className="feature-index">01</span>
          <h3>Issue-first</h3>
          <p>Participants begin with a GitHub issue, not a stack of assumptions.</p>
        </article>

        <article className="feature-card">
          <span className="feature-index">02</span>
          <h3>Agentic coaching</h3>
          <p>The app encourages better framing, risk spotting, and next-step articulation.</p>
        </article>

        <article className="feature-card">
          <span className="feature-index">03</span>
          <h3>Prototype-ready</h3>
          <p>Teams can move quickly from concept to a testable prototype and preview URL.</p>
        </article>
      </section>
    </div>
  );
}
