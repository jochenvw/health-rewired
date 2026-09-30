import { useEffect, useRef, useState, type ReactNode } from 'react';
import './hospital.css';

/*
 * Shared clinical-workstation shell for idea pages, built on the prototype design language
 * (.github/hackathon/design-language.md): dark institutional chrome, cool neutral work surfaces,
 * semantic --cp-* tokens, one restrained accent, and layered disclosure (banner -> task ->
 * supporting detail -> inspection drawer). Everything inside <HospitalShell> uses the "hx" theme;
 * existing generative-UI blocks adapt automatically because the shared tokens are remapped.
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

export type HxTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'hx-theme';

function initialHxTheme(): HxTheme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Shared Light/Dark theme state, initialised synchronously (before paint) from a saved choice or
 * system preference, and persisted for the next visit. */
function useHxTheme(): [HxTheme, (t: HxTheme) => void] {
  const [theme, setTheme] = useState<HxTheme>(initialHxTheme);
  const setAndStore = (t: HxTheme) => {
    setTheme(t);
    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* storage unavailable (e.g. private mode) — theme still applies for this session */
    }
  };
  return [theme, setAndStore];
}

/** Plainly labelled, always-visible Light/Dark buttons — never an icon-only or ambiguous toggle. */
function ThemeButtons({ theme, onChange }: { theme: HxTheme; onChange: (t: HxTheme) => void }) {
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
  const [theme, setTheme] = useHxTheme();
  return (
    <div className="hx" data-theme={theme}>
      <div className="hx-appbar">
        <span className="hx-logo">KR</span>
        <strong>Klinikum Rewired München</strong>
        <span className="hx-appbar-sep">|</span>
        <span>Oncology Information System</span>
        <span className="hx-appbar-sep">|</span>
        <span>{module}</span>
        <span className="hx-spacer" />
        <ThemeButtons theme={theme} onChange={setTheme} />
        <span className="hx-appbar-sep">|</span>
        <span>Dr. M. Weber · Medical Oncology</span>
        <span className="hx-appbar-sep">|</span>
        <span>{today}</span>
      </div>
      <div className="hx-menubar" aria-hidden>
        {['File', 'Patient', 'Orders', 'Documents', 'View', 'Tools', 'Help'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      {guide}
      {patient && <PatientBanner patient={patient} />}
      <div className="hx-body">
        <nav className="hx-nav" aria-label={module}>
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
        <span>● Connected</span>
        <span>Synthetic data only – not for clinical use</span>
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

export function Panel({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  /** Small monospaced operational label above the title, e.g. "CURRENT CONCLUSION". */
  eyebrow?: string;
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

/** Small monospaced operational label that orients a section, e.g. "HUMAN REVIEW REQUIRED". */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="hx-eyebrow">{children}</span>;
}

/**
 * Attention strip: a 4px semantic edge, a status badge and one plain-language explanation. Keep it
 * visible until the condition is genuinely resolved (design-language.md, "Attention and blocking
 * states").
 */
export function AttentionStrip({
  tone = 'info',
  label,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'crit' | 'ok';
  label: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="hx-attention" data-tone={tone} role="status">
      <Pill tone={tone === 'info' ? 'info' : tone}>{label}</Pill>
      <div className="hx-attention-body">
        {children}
        {action}
      </div>
    </div>
  );
}

/**
 * Inspection drawer: right-side panel for evidence, provenance and complete records, one action
 * away from a consequential summary. Handles Escape and restores focus to the trigger on close.
 */
export function Drawer({
  title,
  eyebrow = 'Inspectable by design',
  open,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      lastFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="hx-drawer-backdrop" onClick={onClose} />
      <div className="hx-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <button ref={closeRef} type="button" className="hx-drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="hx-drawer-body">{children}</div>
      </div>
    </>
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
