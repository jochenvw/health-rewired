import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'ai';

const paths = {
  board: 'M4 6.5h16M8 3.5v4M16 3.5v4M5.5 5h13a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5ZM8 11h3M8 15h6',
  queue: 'M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1.2 1.2L7 5.5M4 12l1.2 1.2L7 11M4 17.5h3',
  ready: 'M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5ZM9 12l2.2 2.2L15.5 10',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.6-4.6',
  overview: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  timeline: 'M7 4v16M7 7.5h0M7 12h0M7 16.5h0M10 7.5h10M10 12h7M10 16.5h9',
  evidence: 'M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5H7ZM14 3.5V8h4M9 12h6M9 15.5h6',
  identity: 'M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20c.6-3.3 3-5.5 6-5.5 1.5 0 2.8.5 3.8 1.4M15 18l2 2 4-4.5',
  completeness: 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5M12 3.5V12h8.5M12 3.5a8.5 8.5 0 0 1 8.5 8.5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z',
  spark: 'M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8 1.8-5ZM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z',
  alert: 'M12 4 3 19.5h18L12 4ZM12 10v4.5M12 17.2v.1',
  image: 'M4.5 5h15a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-15a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5ZM4 16l4.5-4.5 4 4 2.5-2.5L20 18M15.5 9.5h0',
  flask: 'M9.5 3.5h5M10.5 3.5v5.2L5.2 18.2A1.5 1.5 0 0 0 6.5 20.5h11a1.5 1.5 0 0 0 1.3-2.3L13.5 8.7V3.5M7.5 14.5h9',
  pill: 'M10.6 19.4a4.2 4.2 0 0 1-6-6l7.8-7.8a4.2 4.2 0 0 1 6 6l-7.8 7.8ZM8.5 9.5l6 6',
  drop: 'M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5Z',
  dot: 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  chevron: 'M9.5 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14.8c1.6.8 2.7 2.6 3 5.2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
  stethoscope: 'M6 3.5v6a4 4 0 0 0 8 0v-6M6 3.5h1.5M12.5 3.5H14M10 13.5v2a4.5 4.5 0 0 0 9 0v-2M19 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="p74-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`p74-pill tone-${tone}`}>{children}</span>;
}

export function Panel({ title, actions, eyebrow, icon, className, children }: { title: ReactNode; actions?: ReactNode; eyebrow?: string; icon?: IconName; className?: string; children: ReactNode }) {
  return (
    <section className={`p74-card${className ? ` ${className}` : ''}`}>
      <header className="p74-card-head">
        {icon && <span className="p74-card-icon"><Icon name={icon} /></span>}
        <div className="p74-card-title">
          {eyebrow && <span className="p74-card-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="p74-card-actions">{actions}</div>}
      </header>
      <div className="p74-card-body">{children}</div>
    </section>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 112;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    4 + (index * (width - 8)) / (values.length - 1),
    height - 5 - ((value - min) / span) * (height - 10),
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = points.at(-1) ?? [0, 0];
  return (
    <svg className="p74-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={`4,${height} ${line} ${width - 4},${height}`} className="p74-sparkline-area" />
      <polyline points={line} className="p74-sparkline-line" />
      <circle cx={last[0]} cy={last[1]} r="3" className="p74-sparkline-dot" />
    </svg>
  );
}

export type ShellPatient = { id: string; name: string; meta: string; status: string; tone: Tone };
export type SearchEntry = { id: string; kind: string; title: string; detail: string; keywords?: string; onSelect: () => void };

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`p74-avatar size-${size}`} aria-hidden="true">{initials(name)}</span>;
}

function Spotlight({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? entries.filter((entry) => {
          const haystack = `${entry.title} ${entry.detail} ${entry.kind} ${entry.keywords ?? ''}`.toLowerCase();
          return terms.every((term) => haystack.includes(term));
        })
      : entries.filter((entry) => entry.kind === 'Patient');
    return matches.slice(0, 8);
  }, [entries, query]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => setCursor(0), [query]);

  const choose = (entry?: SearchEntry) => {
    if (!entry) return;
    entry.onSelect();
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="p74-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <Icon name="search" size={16} />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="p74-search-results"
        aria-label="Search patients, notes and results"
        placeholder="Search patients, notes, results…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setCursor((value) => Math.min(value + 1, results.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setCursor((value) => Math.max(value - 1, 0)); }
          if (event.key === 'Enter') { event.preventDefault(); choose(results[cursor]); }
          if (event.key === 'Escape') { event.preventDefault(); setQuery(''); setOpen(false); input.current?.blur(); }
        }}
      />
      <kbd>/</kbd>
      {open && (
        <div className="p74-search-results" id="p74-search-results" role="listbox">
          {results.length === 0 ? (
            <p>No synthetic patient, note or result matches “{query}”.</p>
          ) : results.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={index === cursor}
              className={index === cursor ? 'active' : ''}
              onMouseEnter={() => setCursor(index)}
              onClick={() => choose(entry)}
            >
              <span className="p74-search-kind">{entry.kind}</span>
              <strong>{entry.title}</strong>
              <small>{entry.detail}</small>
            </button>
          ))}
          <footer>Synthetic records only · ↑↓ to move · Enter to open</footer>
        </div>
      )}
    </div>
  );
}

export function ClinicalShell({
  patients,
  selectedPatientId,
  highlightPatient,
  onPatient,
  search,
  controls,
  guide,
  children,
}: {
  patients: ShellPatient[];
  selectedPatientId: string;
  highlightPatient: boolean;
  onPatient: (id: string) => void;
  search: SearchEntry[];
  controls: ReactNode;
  guide: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p74-app">
      <aside className="p74-sidebar" aria-label="Patients on tomorrow's MDT">
        <div className="p74-brand">
          <span className="p74-brand-mark" aria-hidden="true"><Icon name="stethoscope" size={18} /></span>
          <div><strong>MDT Prep</strong><small>Colorectal tumour board</small></div>
        </div>
        <div className="p74-sidebar-section">
          <span className="p74-sidebar-label">Patients · tomorrow · {patients.length}</span>
          <p className="p74-sidebar-hint">Switch patient · you stay on the same workflow step.</p>
          <ul className="p74-patient-list">
            {patients.map((patient) => (
              <li key={patient.id}>
                <button type="button" className={selectedPatientId === patient.id && highlightPatient ? 'active' : ''} aria-current={selectedPatientId === patient.id && highlightPatient ? 'true' : undefined} onClick={() => onPatient(patient.id)}>
                  <Avatar name={patient.name} size="sm" />
                  <span><strong>{patient.name}</strong><small>{patient.meta}</small></span>
                  <i className={`p74-status-dot tone-${patient.tone}`} title={patient.status} aria-label={patient.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="p74-sidebar-note"><Icon name="alert" size={14} /> Synthetic data · not for clinical use</p>
      </aside>
      <div className="p74-workspace">
        <header className="p74-topbar">
          <Spotlight entries={search} />
          <div className="p74-topbar-controls">{controls}</div>
        </header>
        {guide}
        <div className="p74-content">{children}</div>
        <footer className="p74-footer">Synthetic data only · not for clinical use · Copilot SDK proposes, clinicians decide · Oncology Hackathon 2026 Munich</footer>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; icon?: IconName }[]; onChange: (value: T) => void }) {
  return (
    <div className="p74-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} className={value === option.id ? 'active' : ''} onClick={() => onChange(option.id)}>
          {option.icon && <Icon name={option.icon} size={15} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Sub-steps of one guided-workflow step, in the order the work is done, with a Next action. */
export function ReviewSteps({ step, title, tabs, active, onChange, next }: {
  step: number;
  title: string;
  tabs: { id: string; label: string; badge?: string | number }[];
  active: string;
  onChange: (id: string) => void;
  next: { label: string; onClick: () => void };
}) {
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === active));
  const following = tabs[index + 1];
  return (
    <nav className="p74-tabs p74-substeps" aria-label={`Step ${step} · ${title}`}>
      <span className="p74-substeps-label">Step {step} · {title}</span>
      <ol>
        {tabs.map((tab, i) => (
          <li key={tab.id}>
            <button type="button" className={`${active === tab.id ? 'active' : ''}${i < index ? ' done' : ''}`} aria-current={active === tab.id ? 'step' : undefined} onClick={() => onChange(tab.id)}>
              <span className="p74-substep-num" aria-hidden="true">{step}.{i + 1}</span>
              {tab.label}
              {tab.badge !== undefined && tab.badge !== '' && tab.badge !== 0 && <em>{tab.badge}</em>}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="hx-btn sm p74-substeps-next" onClick={following ? () => onChange(following.id) : next.onClick}>
        Next: {following ? following.label : next.label} →
      </button>
    </nav>
  );
}
