export type Severity = 'info' | 'warning' | 'critical';

export type UIItem = {
  label: string;
  detail?: string | null;
  date?: string | null;
  source?: string | null;
  severity?: Severity | null;
};

export type UIBlock = {
  type: string;
  title: string;
  body?: string | null;
  severity?: Severity | null;
  items: UIItem[];
};

export type AgentResult = {
  mode: 'copilot' | 'fallback';
  headline: string;
  blocks: UIBlock[];
  trace: { tool: string; arguments?: string | null }[];
  note?: string | null;
};

export type Status = {
  event: string;
  city: string;
  version: string;
  preview_label: string | null;
  copilot: { auth_mode: string; model: string };
};

export type PatientSummary = { id: string; name: string; age: number; diagnosis: string };

/** Full synthetic record from /sample-data/patients/<id>.json. */
export type PatientRecord = {
  id: string;
  name: string;
  age: number;
  sex: string;
  ecog: number;
  diagnosis: { primary: string; date: string; stage: string; grade?: number; biomarkers: Record<string, string> };
  comorbidities: string[];
  medications: string[];
  treatments: { type: string; regimen: string; start: string; status: string; cycle?: string }[];
  labs: { date: string; test: string; value: number; unit: string; ref: string; flag?: string }[];
  patient_reported: { date: string; symptom: string; grade: number }[];
  timeline: { date: string; event: string }[];
  open_questions: string[];
};

export type Issue53Indicator = { key: string; label: string; unit: string; target: number; lower_is_better?: boolean };

export type Issue53Hospital = {
  id: string;
  name: string;
  country: string;
  cases: number;
  totals_only: boolean;
  indicators: Record<string, number>;
  median_mri_wait_days: number;
  patient_mix: Record<string, number>;
  process: Record<string, number>;
  next_quarter: { time_to_treatment: number; median_mri_wait_days: number };
};

export type Issue53AuditCase = {
  local_id: string;
  age_band: string;
  tumour: string;
  mri_wait_days: number;
  treatment_wait_days: number;
  reason: string;
};

export type Issue53QualitySnapshot = {
  quarter: string;
  next_quarter: string;
  indicators: Issue53Indicator[];
  hospitals: Issue53Hospital[];
  network_average: Record<string, number>;
  signal: {
    hospital_id: string;
    headline: string;
    observed: number;
    network_average: number;
    target: number;
    gap: number;
    likely_cause: string;
    cause_detail: string;
    next_quarter_observed: number;
  };
  audit_cases: Issue53AuditCase[];
  agenda: string[];
  intervention: { label: string; expected_effect: string };
  data_flow: { step: string; detail: string }[];
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export const api = {
  status: () => apiRequest<Status>('/api/status'),
  patients: () => apiRequest<PatientSummary[]>('/api/patients'),
  patient: (id: string) => apiRequest<PatientRecord>(`/api/sample-data/patients/${id}.json`),
  sampleData: <T,>(path: string) => apiRequest<T>(`/api/sample-data/${path}`),
  runAgent: (body: { task: string; patient_id?: string; role?: string }) =>
    apiRequest<AgentResult>('/api/agent/run', { method: 'POST', body: JSON.stringify(body) }),
  issue53: {
    qualitySnapshot: () => apiRequest<Issue53QualitySnapshot>('/api/ideas/53/quality-snapshot'),
    assistant: (body: { task: string; role: string }) =>
      apiRequest<AgentResult>('/api/ideas/53/assistant', { method: 'POST', body: JSON.stringify(body) }),
  },
};
