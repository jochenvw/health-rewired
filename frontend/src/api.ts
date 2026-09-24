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
  imaging?: { date: string; modality: string; result: string }[];
  patient_reported: { date: string; symptom: string; grade: number }[];
  timeline: { date: string; event: string }[];
  open_questions: string[];
};

export type NetworkFeedbackEntry = {
  id: string;
  patient_id: string;
  approach_category: string;
  approach_label: string;
  chosen_treatment: string;
  outcome_note: string;
  recorded_at: string;
};

/** One hospital node in the simulated European network (issue #37). */
export type NetworkHospital = { id: string; name: string; country: string; matched: number };

/** One comparable case returned by the federated query, already joined with its hospital (issue #37). */
export type NetworkCase = {
  id: string;
  hospital_id: string;
  hospital_name: string;
  country: string;
  approach_category: string;
  outcome_category: string;
  outcome_detail: string;
  pfs_months: number | null;
  followup_months: number | null;
};

export type NetworkApproach = {
  category: string;
  approach: string;
  n: number;
  outcomes: Record<string, number>;
  median_pfs_months: number | null;
  hospitals: { name: string; n: number }[];
  examples: string[];
};

/** Structured, deterministic federated-query result (issue #37) – drives the network map and cohort landscape. */
export type NetworkSnapshot = {
  network_hospitals_queried: number;
  matched_total: number;
  comparability_criteria: string;
  hospitals: NetworkHospital[];
  hospitals_with_matches: { name: string; n: number }[];
  approaches: NetworkApproach[];
  cases: NetworkCase[];
  evidence_flags: string[];
  privacy_note: string;
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
  // Issue #37 – A Europe-wide learning treatment system.
  queryEuNetwork: (body: { task: string; patient_id: string }) =>
    request<AgentResult>('/api/ideas/37/query', { method: 'POST', body: JSON.stringify(body) }),
  networkSnapshot: (patientId: string) => request<NetworkSnapshot>(`/api/ideas/37/network/${patientId}`),
  recordNetworkFeedback: (body: {
    patient_id: string;
    approach_category: string;
    chosen_treatment: string;
    outcome_note: string;
  }) =>
    request<{ entry: NetworkFeedbackEntry; total_learning_entries: number }>('/api/ideas/37/feedback', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  networkLearningLog: () => request<NetworkFeedbackEntry[]>('/api/ideas/37/log'),
};
