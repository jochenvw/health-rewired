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


export type Issue56WorklistRow = {
  time: string;
  id: string;
  patient_id: string;
  name: string;
  age: number;
  ward: string;
  reason: string;
  sofa: number;
  status: string;
};
export type Issue56Severity = 'info' | 'warning' | 'critical';
export type Issue56Vital = { label: string; value: string; detail: string; severity: Issue56Severity };
export type Issue56Cause = { cause: string; why: string; source: string; severity: Issue56Severity };
export type Issue56Source = { name: string; path: string; status: string; finding: string };
export type Issue56HospitalOutcome = { site: string; matched: number; icu_survival: string; range: string; note: string };
export type Issue56Scenario = {
  synthetic: boolean;
  scenario: string;
  worklist: Issue56WorklistRow[];
  icu: { consult_time: string; location: string; reason: string; vitals: Issue56Vital[]; possible_causes: Issue56Cause[] };
  sources: Issue56Source[];
  onco_icu_card: {
    tumour: string;
    stage: string;
    current_treatment: string;
    response: string;
    planned_next_treatment: string;
    treatment_related_causes: string[];
    wishes: string;
    missing_information: string[];
  };
  outcomes: {
    query: string;
    hospitals: Issue56HospitalOutcome[];
    aggregate: { matched: number; icu_survival: string; range: string; ward_alive_30d: string; treatment_resumed_60d: string };
    disclaimer: string;
  };
  follow_up: { to: string; subject: string; draft: string; requires_approval: string[] };
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export const api = {
  status: () => request<Status>('/api/status'),
  patients: () => request<PatientSummary[]>('/api/patients'),
  patient: (id: string) => request<PatientRecord>(`/api/sample-data/patients/${id}.json`),
  sampleData: <T,>(path: string) => request<T>(`/api/sample-data/${path}`),
  runAgent: (body: { task: string; patient_id?: string; role?: string }) =>
    request<AgentResult>('/api/agent/run', { method: 'POST', body: JSON.stringify(body) }),
  issue56Scenario: () => request<Issue56Scenario>('/api/ideas/56/scenario'),
  issue56Agent: (body: { task: string; patient_id?: string; role?: string }) =>
    request<AgentResult>('/api/ideas/56/agent', { method: 'POST', body: JSON.stringify(body) }),
};
