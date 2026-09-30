import { useEffect, useRef, type ReactNode } from 'react';
import './workspace.css';

/*
 * Issue-local workspace primitives for #50, built on the shared design language
 * (.github/hackathon/design-language.md): institutional chrome, context banner, sidebar
 * workspace map, bounded canvas, eyebrows, panels, textual status, attention strip and a
 * focus-managed inspection drawer. Everything is scoped to `.rr`; no shared styles change.
 */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type WorkspaceItem = { id: string; label: string; state?: string; count?: number | string };

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="rr-eyebrow">{children}</span>;
}

export function Status({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="rr-status" data-tone={tone}>
      {children}
    </span>
  );
}

export function Workspace({
  product,
  module,
  organisation,
  location,
  headerFacts,
  banner,
  workspaces,
  active,
  onNavigate,
  guide,
  toolbar,
  children,
  drawer,
}: {
  product: string;
  module: string;
  organisation: string;
  location: string;
  headerFacts: { label: string; value: string }[];
  banner: ReactNode;
  workspaces: WorkspaceItem[];
  active: string;
  onNavigate: (id: string) => void;
  guide?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  drawer?: ReactNode;
}) {
  return (
    <div className="rr">
      <a className="rr-skip" href="#rr-canvas">
        Skip to the current task
      </a>
      <header className="rr-header">
        <span className="rr-mark" aria-hidden>
          RR
        </span>
        <span className="rr-header-id">
          <strong>
            {product} · {module}
          </strong>
          <span>
            {organisation} · {location}
          </span>
        </span>
        <div className="rr-header-facts">
          {headerFacts.map((fact) => (
            <span key={fact.label} className="rr-header-fact">
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </span>
          ))}
          <span className="rr-conn">Synthetic record exchange · connected</span>
        </div>
      </header>
      {banner}
      {guide}
      <div className="rr-body">
        <nav className="rr-sidebar" aria-label="Workspaces">
          <Eyebrow>
            <span className="rr-sidebar-eyebrow">Workspaces</span>
          </Eyebrow>
          {workspaces.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="rr-sidebar-label">
                {item.label}
                {item.count !== undefined && <span className="rr-count">{item.count}</span>}
              </span>
              {item.state && <span className="rr-sidebar-state">{item.state}</span>}
            </button>
          ))}
        </nav>
        <div className="rr-main">
          {toolbar && <div className="rr-toolbar">{toolbar}</div>}
          <main className="rr-canvas" id="rr-canvas" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      {drawer}
    </div>
  );
}

export function ContextBanner({
  identity,
  subIdentity,
  facts,
  action,
}: {
  identity: string;
  subIdentity: string;
  facts: { label: string; value: ReactNode }[];
  action?: ReactNode;
}) {
  return (
    <section className="rr-banner" aria-label="Current patient">
      <div className="rr-banner-identity">
        <strong>{identity}</strong>
        <span>{subIdentity}</span>
      </div>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {action && <div className="rr-banner-action">{action}</div>}
    </section>
  );
}

export function Panel({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rr-panel">
      <header>
        <div className="rr-panel-head-text">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h3>{title}</h3>
        </div>
        {actions && <div className="rr-panel-actions">{actions}</div>}
      </header>
      <div className="rr-panel-body">{children}</div>
    </section>
  );
}

/** Attention strip: a semantic edge, a textual status, one plain-language explanation. */
export function Attention({
  tone,
  status,
  headline,
  detail,
  action,
}: {
  tone: Exclude<Tone, 'neutral'>;
  status: string;
  headline: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <section className="rr-attention" data-tone={tone} aria-label="Needs attention">
      <Status tone={tone}>{status}</Status>
      <div className="rr-attention-text">
        <strong>{headline}</strong>
        <p>{detail}</p>
      </div>
      {action && <div className="rr-actions">{action}</div>}
    </section>
  );
}

export type Column<T> = { key: string; label: string; width?: string; render: (row: T) => ReactNode };

export function Table<T>({
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
    <div className="rr-table-wrap">
      <table className="rr-table">
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
              <td colSpan={columns.length} className="rr-empty">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={onSelect ? 'clickable' : undefined}
                aria-selected={selected === key || undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(row) : undefined}
                onKeyDown={
                  onSelect
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Right-side inspection drawer: Escape to close, focus moved in and restored on close. */
export function Drawer({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="rr-drawer-backdrop" onClick={onClose} />
      <div className="rr-drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <header>
          <div className="rr-panel-head-text">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h3>{title}</h3>
          </div>
          <button type="button" className="rr-btn small" style={{ marginLeft: 'auto' }} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="rr-drawer-body">{children}</div>
      </div>
    </>
  );
}
