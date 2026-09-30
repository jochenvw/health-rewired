import { useEffect, useRef, useState, type ReactNode } from 'react';
import './hospital.css';

/*
 * Shared institutional shell for idea prototypes, built on the Health Rewired design language
 * (.github/hackathon/design-language.md): dark institutional chrome, cool neutral work surfaces,
 * one restrained accent, semantic status colors and visible human control. Everything inside
 * <HospitalShell> uses the "hx" theme's --cp-* tokens; existing generative-UI blocks adapt
 * automatically. Vary the workspace's structure per idea — not these shared foundations.
 */

export type NavItem = { id: string; label: string; badge?: string | number };

export type BannerPatient = {
  id: string;
  name: string;
  age?: number;
  sex?: string;
  diagnosis?: string;
  allergies?: string;
  ward?: string;
};

const THEME_KEY = 'health-rewired-theme';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  return [theme, setTheme] as const;
}

/** Visible, plainly labelled Light/Dark controls — never an icon-only or ambiguous single toggle. */
function ThemeToggle({ theme, onChange }: { theme: 'light' | 'dark'; onChange: (t: 'light' | 'dark') => void }) {
  return (
    <div className="hx-theme-toggle" role="group" aria-label="Theme">
      <button type="button" aria-pressed={theme === 'light'} onClick={() => onChange('light')}>
        Light
      </button>
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => onChange('dark')}>
        Dark
      </button>
    </div>
  );
}

export function HospitalShell({
  module,
  orgLine = 'Klinikum Rewired München · Medical Oncology',
  nav,
  active,
  onNav,
  patient,
  guide,
  toolbar,
  children,
}: {
  /** Name of the module/screen in the hospital system, e.g. "Tumour board preparation". */
  module: string;
  /** Organization / department line shown under the module in the institutional header. */
  orgLine?: string;
  nav: NavItem[];
  active: string;
  onNav: (id: string) => void;
  patient?: BannerPatient | null;
  /** Guided-demo bar (StoryGuide) shown above the screen. */
  guide?: ReactNode;
  /** Buttons / selectors shown in the toolbar above the content. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const today = new Date().toLocaleDateString('de-DE');
  const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const [theme, setTheme] = useTheme();
  return (
    <div className="hx" data-theme={theme}>
      <div className="hx-strip">Hackathon prototype · Synthetic data only — not for clinical use</div>
      <header className="hx-chrome">
        <div className="hx-chrome-id">
          <span className="hx-mark" aria-hidden>
            HR
          </span>
          <div>
            <strong className="hx-chrome-title">
              Health Rewired <span className="hx-chrome-sep">/</span> {module}
            </strong>
            <span className="hx-chrome-sub">{orgLine}</span>
          </div>
        </div>
        <div className="hx-chrome-meta">
          <span>{today}</span>
          <span>{time}</span>
          <span className="hx-chrome-status">
            <span className="hx-chrome-dot" aria-hidden /> Connected
          </span>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
      </header>
      {guide}
      {patient && <PatientBanner patient={patient} />}
      <div className="hx-body">
        <nav className="hx-nav" aria-label={module}>
          <span className="hx-eyebrow hx-nav-eyebrow">Workspace</span>
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === active ? 'active' : undefined}
              onClick={() => onNav(item.id)}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && <span className="hx-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <main className="hx-main">
          {toolbar && <div className="hx-toolbar">{toolbar}</div>}
          <div className="hx-content">{children}</div>
        </main>
      </div>
      <div className="hx-statusbar">
        <span className="hx-chrome-status">
          <span className="hx-chrome-dot" aria-hidden /> Connected
        </span>
        <span className="hx-spacer" />
        <span>OIS 12.4.2 · Hackathon prototype</span>
      </div>
    </div>
  );
}

export function PatientBanner({ patient }: { patient: BannerPatient }) {
  const [first, ...rest] = patient.name.split(' ');
  const born = patient.age ? `*${2026 - patient.age}` : '';
  return (
    <div className="hx-banner">
      <strong className="hx-banner-name">
        {rest.join(' ').toUpperCase()}, {first}
      </strong>
      <span>
        {patient.sex ? patient.sex[0].toUpperCase() : ''} {patient.age ? `${patient.age} y` : ''} {born}
      </span>
      <span>MRN {patient.id.replace(/\D/g, '').padStart(8, '0')}</span>
      <span>{patient.ward ?? 'Oncology Day Unit 3B'}</span>
      {patient.diagnosis && <span className="hx-banner-dx">{patient.diagnosis}</span>}
      <span className="hx-allergy">Allergies: {patient.allergies ?? 'NKDA'}</span>
    </div>
  );
}

/** Small monospaced operational label above a plain-language heading, e.g. "STRUCTURED QUERY". */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="hx-eyebrow">{children}</span>;
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  /** Small monospaced operational label shown above the title. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="hx-panel">
      <header>
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h3>{title}</h3>
        </div>
        {actions && <div className="hx-panel-actions">{actions}</div>}
      </header>
      <div className="hx-panel-body">{children}</div>
    </section>
  );
}

/**
 * Blocking or attention-worthy state: a 4 px semantic edge, a status badge and one plain-language
 * explanation, with an optional action that focuses the required human input. Keep visible until
 * genuinely resolved — see design-language.md "Attention and blocking states".
 */
export function AttentionStrip({
  tone = 'warning',
  title,
  children,
  action,
}: {
  tone?: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`hx-attention hx-attention-${tone}`} role="status">
      <div className="hx-attention-body">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action && <div className="hx-attention-action">{action}</div>}
    </div>
  );
}

/**
 * Right-side inspection drawer for evidence, provenance and complete records — "inspectable by
 * design" rather than hidden. Handles Escape and restores focus to the close control on open.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow = 'Inspectable by design',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: ReactNode;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="hx-drawer-overlay" onClick={onClose}>
      <aside className="hx-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h3>{title}</h3>
          </div>
          <button ref={closeRef} type="button" className="hx-drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="hx-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export type Column<T> = { key: string; label: string; render?: (row: T) => ReactNode; width?: string };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selected,
  onSelect,
  rowTone,
  empty = 'No entries.',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selected?: string | null;
  onSelect?: (row: T) => void;
  /** Highlight a row, e.g. abnormal results. */
  rowTone?: (row: T) => 'warn' | 'crit' | undefined;
  empty?: string;
}) {
  return (
    <table className="hx-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={c.width ? { width: c.width } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="hx-empty">
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
    <div className="hx-tabs" role="tablist">
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

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'crit' | 'info'; children: ReactNode }) {
  return <span className={`hx-pill hx-pill-${tone}`}>{children}</span>;
}
