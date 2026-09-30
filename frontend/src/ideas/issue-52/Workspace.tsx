import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStages, type Stage } from '../../hospital/Story';
import './issue-52.css';

/*
 * Issue-local workspace for idea 52, built on the shared design language
 * (.github/hackathon/design-language.md). Shared HospitalShell styles are not modified; this file
 * only reuses the documented --cp-* tokens, typography, spacing, status semantics and
 * inspectability patterns, arranged for a document-authoring workspace with source emphasis.
 */

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export type NavItem = { id: string; label: string; detail?: string; count?: number | string };

export type BannerFact = { label: string; value: ReactNode };

export function Workspace({
  product,
  module,
  organisation,
  location,
  banner,
  nav,
  active,
  onNav,
  guide,
  toolbar,
  drawer,
  children,
}: {
  product: string;
  module: string;
  organisation: string;
  location: string;
  banner?: { name: string; sub: string; facts: BannerFact[]; action?: ReactNode } | null;
  nav: NavItem[];
  active: string;
  onNav: (id: string) => void;
  guide?: ReactNode;
  toolbar?: ReactNode;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  const now = new Date();
  return (
    <div className="x52">
      <a className="x52-skip" href="#x52-canvas">
        Skip to the current task
      </a>
      <div className="x52-proto" role="note">
        <span>Hackathon prototype</span>
        <span>·</span>
        <span>Synthetic data only</span>
        <span>·</span>
        <span>Not for clinical use</span>
      </div>
      <header className="x52-chrome">
        <span className="x52-mark" aria-hidden>
          MDT
        </span>
        <span className="x52-chrome-id">
          <span className="x52-chrome-product">
            {product} / {module}
          </span>
          <span className="x52-chrome-org">{organisation}</span>
        </span>
        <span className="x52-chrome-meta">
          <span>
            <strong>{location}</strong>
          </span>
          <span>{now.toLocaleDateString('de-DE')}</span>
          <span className="x52-conn">Record system connected</span>
          <span>
            <strong>Dr. M. Weber</strong> · Nurse specialist desk
          </span>
        </span>
      </header>
      {banner && (
        <div className="x52-banner">
          <span className="x52-banner-id">
            <span className="x52-banner-name">{banner.name}</span>
            <span className="x52-banner-sub">{banner.sub}</span>
          </span>
          <span className="x52-banner-facts">
            {banner.facts.map((fact) => (
              <span className="x52-banner-fact" key={fact.label}>
                <span>{fact.label}</span>
                <span>{fact.value}</span>
              </span>
            ))}
          </span>
          {banner.action}
        </div>
      )}
      {guide}
      <div className="x52-body">
        <nav className="x52-sidebar" aria-label="Workspaces">
          <span className="x52-sidebar-eyebrow">Post-MDT communication</span>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === active ? 'active' : undefined}
              aria-current={item.id === active ? 'page' : undefined}
              onClick={() => onNav(item.id)}
            >
              <span className="x52-sidebar-label">
                <span>{item.label}</span>
                {item.detail && <span className="x52-sidebar-detail">{item.detail}</span>}
              </span>
              {item.count !== undefined && <span className="x52-count">{item.count}</span>}
            </button>
          ))}
        </nav>
        <main className="x52-main">
          {toolbar && <div className="x52-toolbar">{toolbar}</div>}
          <div className="x52-canvas" id="x52-canvas">
            {children}
          </div>
        </main>
      </div>
      <div className="x52-statusbar">
        <span>Synthetic data only – not for clinical use</span>
        <span>Nothing is sent without clinician approval</span>
        <span className="x52-spacer" />
        <span>Post-MDT Communication 0.4 · Hackathon prototype</span>
      </div>
      {drawer}
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  actions,
  variant,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  /** `report` uses the squared, strongly ruled treatment for source documents and letters. */
  variant?: 'report';
  children: ReactNode;
}) {
  return (
    <section className={['x52-panel', variant ?? ''].join(' ').trim()}>
      <header>
        <span className="x52-panel-title">
          {eyebrow && <span className="x52-eyebrow">{eyebrow}</span>}
          <h3>{title}</h3>
        </span>
        {actions && <span className="x52-panel-actions">{actions}</span>}
      </header>
      <div className="x52-panel-body">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', live, children }: { tone?: Tone; live?: boolean; children: ReactNode }) {
  return <span className={['x52-badge', tone, live ? 'live' : ''].join(' ').trim()}>{children}</span>;
}

/** Attention strip: semantic edge, status badge and one plain-language explanation. */
export function Attention({
  tone = 'warn',
  status,
  title,
  children,
  action,
}: {
  tone?: 'warn' | 'ok' | 'danger';
  status: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`x52-attention ${tone}`} role="status">
      <Badge tone={tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'danger'}>{status}</Badge>
      <span className="x52-attention-text">
        <strong>{title}</strong>
        {children}
      </span>
      {action}
    </div>
  );
}

export type Column<T> = { key: string; label: string; render?: (row: T) => ReactNode; width?: string };

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  selected,
  onSelect,
  empty = 'No entries.',
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selected?: string | null;
  onSelect?: (row: T) => void;
  empty?: string;
}) {
  return (
    <table className="x52-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="x52-empty">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              className={[key === selected ? 'selected' : '', onSelect ? 'clickable' : ''].join(' ').trim()}
              onClick={onSelect ? () => onSelect(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="x52-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={t.id === active ? 'active' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Immediate, always-visible activity label for any wait. */
export function Working({ label, hint }: { label: string; hint?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="x52-working" role="status" aria-live="polite">
      <span className="x52-spinner" aria-hidden />
      <span>
        {label} · {seconds}s{hint && seconds >= 8 && <> – {hint}</>}
      </span>
    </span>
  );
}

export type { Stage };

/** Visible account of the work the system does out of sight, in the workspace's own chrome. */
export function Backstage({
  title,
  stages,
  running,
  holdLast,
  release,
  note,
}: {
  title: string;
  stages: Stage[];
  running: boolean;
  holdLast?: boolean;
  release?: boolean;
  note?: ReactNode;
}) {
  const { done, finished } = useStages(stages, running, { holdLast, release });
  if (!running) return null;
  return (
    <section className="x52-backstage" aria-live="polite">
      <header>
        <span className="x52-eyebrow">{title}</span>
        {finished ? (
          <Badge tone="ok">Completed</Badge>
        ) : (
          <>
            <Badge tone="accent" live>
              Running
            </Badge>
            <Working label="Working" hint="the assistant can take up to a minute" />
          </>
        )}
      </header>
      <ol>
        {stages.map((stage, index) => {
          const state = index < done ? 'done' : index === done ? 'running' : 'waiting';
          return (
            <li key={stage.label} className={state}>
              <span className="x52-stage-icon" aria-hidden>
                {state === 'done' ? '✓' : state === 'running' ? <span className="x52-spinner" /> : '○'}
              </span>
              <span>
                <span>{stage.label}</span>
                {state !== 'waiting' && stage.detail && <span className="x52-stage-detail">{stage.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {note && <p className="x52-backstage-note">{note}</p>}
    </section>
  );
}

export type GuideStep = { id: string; title: string; explain: ReactNode };

/** Guided story rail, integrated into the institutional chrome rather than floating above it. */
export function GuideRail({
  steps,
  current,
  onGo,
  nextLabel,
}: {
  steps: GuideStep[];
  current: string;
  onGo: (id: string) => void;
  nextLabel?: string;
}) {
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === current),
  );
  const step = steps[index];
  const next = steps[index + 1];
  const prev = steps[index - 1];
  return (
    <div className="x52-guide" role="region" aria-label="Guided walkthrough">
      <ol className="x52-guide-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={i < index ? 'done' : i === index ? 'current' : undefined}>
            <button type="button" onClick={() => onGo(s.id)} aria-current={i === index ? 'step' : undefined}>
              <span className="x52-guide-num" aria-hidden>
                {i < index ? '✓' : i + 1}
              </span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="x52-guide-now">
        <span className="x52-guide-eyebrow">
          Guided walkthrough · step {index + 1} of {steps.length}
        </span>
        <span className="x52-guide-explain">{step?.explain}</span>
        <span className="x52-guide-actions">
          {prev && (
            <button type="button" className="x52-btn" onClick={() => onGo(prev.id)}>
              ← {prev.title}
            </button>
          )}
          {next && (
            <button type="button" className="x52-btn primary" onClick={() => onGo(next.id)}>
              {nextLabel ?? next.title} →
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** Right-side inspection drawer for evidence and provenance: Escape, focus restore, explicit close. */
export function InspectionDrawer({
  open,
  eyebrow = 'Inspectable by design',
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="x52-drawer-backdrop" onClick={onClose} />
      <aside className="x52-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span className="x52-panel-title">
            <span className="x52-eyebrow">{eyebrow}</span>
            <h3>{title}</h3>
            {subtitle && <span className="x52-eyebrow">{subtitle}</span>}
          </span>
          <button ref={closeRef} type="button" className="x52-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close
          </button>
        </header>
        <div className="x52-drawer-body">{children}</div>
      </aside>
    </>
  );
}
