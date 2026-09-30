import { useEffect, useRef, type ReactNode } from 'react';
import './design.css';

/*
 * Issue-local workspace for #48, built on the shared design language
 * (.github/hackathon/design-language.md): prototype strip → institutional chrome → context banner
 * → sidebar + bounded canvas → inspection drawer. Scoped to `.i48`; no shared component changes.
 */

export type NavItem = { id: string; label: string; detail?: string };

export type Fact = { label: string; value: ReactNode };

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="i48-eyebrow">{children}</span>;
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function Status({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`i48-status i48-status-${tone}`}>{children}</span>;
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="i48-panel">
      <header>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3>{title}</h3>
        {actions && <div className="i48-panel-actions">{actions}</div>}
      </header>
      <div className="i48-panel-body">{children}</div>
    </section>
  );
}

/** Attention strip: a semantic edge, a status badge and one plain-language explanation. */
export function Attention({
  tone,
  status,
  children,
  action,
}: {
  tone: 'warning' | 'danger' | 'success';
  status: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`i48-attention ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Status tone={tone}>{status}</Status>
      <p>{children}</p>
      {action && <div className="i48-panel-actions">{action}</div>}
    </div>
  );
}

export type Column<T> = { key: string; label: string; render?: (row: T) => ReactNode; width?: string };

export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  selected,
  onSelect,
  rowTone,
  empty = 'No entries.',
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selected?: string | null;
  onSelect?: (row: T) => void;
  rowTone?: (row: T) => 'danger' | undefined;
  empty?: string;
}) {
  return (
    <table className="i48-table">
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
            <td colSpan={columns.length} className="i48-empty">
              {empty}
            </td>
          </tr>
        )}
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              className={[key === selected ? 'selected' : '', rowTone?.(row) ?? '', onSelect ? 'clickable' : '']
                .join(' ')
                .trim()}
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
    <div className="i48-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Right-side inspection drawer: evidence, provenance and complete records stay one action away. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
      <div className="i48-scrim" onClick={onClose} />
      <div className="i48-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header>
          <div>
            <Eyebrow>Inspectable by design</Eyebrow>
            <h2>{title}</h2>
          </div>
          <div className="i48-panel-actions">
            <button type="button" className="i48-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="i48-drawer-body">{children}</div>
      </div>
    </>
  );
}

export function Workspace({
  module,
  org,
  workstation,
  nav,
  active,
  onNav,
  banner,
  guide,
  toolbar,
  chromeAction,
  drawer,
  children,
}: {
  module: string;
  org: string;
  workstation: string;
  nav: NavItem[];
  active: string;
  onNav: (id: string) => void;
  banner?: { title: string; subtitle: string; facts: Fact[]; action?: ReactNode } | null;
  guide?: ReactNode;
  toolbar?: ReactNode;
  chromeAction?: ReactNode;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <div className="i48">
      <a className="i48-skip" href="#i48-main">
        Skip to the current task
      </a>
      <div className="i48-prototype">Hackathon prototype · synthetic data · not for clinical use</div>
      <header className="i48-chrome">
        <span className="i48-mark" aria-hidden>
          MDS
        </span>
        <span className="i48-product">
          <strong>Minimal dataset · {module}</strong>
          <span>{org}</span>
        </span>
        <div className="i48-chrome-meta">
          <span>{workstation}</span>
          <span>
            <b>{today}</b>
          </span>
          <span className="i48-conn">Four source systems connected</span>
          {chromeAction}
        </div>
      </header>
      {banner && (
        <div className="i48-banner">
          <div className="i48-banner-id">
            <strong>{banner.title}</strong>
            <span>{banner.subtitle}</span>
          </div>
          {banner.facts.map((f) => (
            <dl key={f.label} className="i48-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </dl>
          ))}
          {banner.action && <div className="i48-panel-actions">{banner.action}</div>}
        </div>
      )}
      <div className="i48-body">
        <nav className="i48-sidebar" aria-label="Workspaces">
          <Eyebrow>Workspaces</Eyebrow>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === active ? 'page' : undefined}
              onClick={() => onNav(item.id)}
            >
              {item.label}
              {item.detail && <small>{item.detail}</small>}
            </button>
          ))}
        </nav>
        <main className="i48-canvas" id="i48-main" tabIndex={-1}>
          {guide}
          {toolbar && <div className="i48-toolbar">{toolbar}</div>}
          {children}
        </main>
      </div>
      <footer className="i48-statusbar">
        <span>Synthetic data only · not for clinical use</span>
        <span>Health ReWireD minimal dataset · mCRC v0.3</span>
        <span className="i48-spacer" />
        <span>Idea #48 · hackathon prototype</span>
      </footer>
      {drawer}
    </div>
  );
}
