import type { ReactNode } from 'react';
import './hospital.css';

/*
 * Hospital-software look for idea pages: a deliberately plain clinical information system, so a
 * clinician can picture the idea inside the software they use every day.
 * Everything inside <HospitalShell> uses the light "hx" theme; existing UI blocks adapt automatically.
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
  return (
    <div className="hx">
      <div className="hx-appbar">
        <span className="hx-logo">KR</span>
        <strong>Klinikum Rewired München</strong>
        <span className="hx-appbar-sep">|</span>
        <span>Oncology Information System</span>
        <span className="hx-appbar-sep">|</span>
        <span>{module}</span>
        <span className="hx-spacer" />
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

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="hx-panel">
      <header>
        <h3>{title}</h3>
        {actions && <div className="hx-panel-actions">{actions}</div>}
      </header>
      <div className="hx-panel-body">{children}</div>
    </section>
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
