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

/** Idea #36 – cancer digital twin: one simulated point on a treatment-path trajectory. */
export type TrajectoryPoint = {
  month: number;
  response_pct: number;
  progression_risk_pct: number;
  toxicity_grade: number;
  note?: string | null;
  note_kind?: 'assumption' | 'evidence' | null;
};

/** Idea #36 – cancer digital twin: one of the three simulated next-treatment paths. */
export type TreatmentPath = {
  id: string;
  name: string;
  description: string;
  trajectory: TrajectoryPoint[];
  assumptions: string[];
  evidence: string[];
};

/** Idea #36 – cancer digital twin: clinician-controlled what-if inputs that recompute the simulation. */
export type BiopsyResult = 'unknown' | 'met_amplification' | 't790m' | 'no_mechanism_found';
export type Priority = 'balanced' | 'minimize_toxicity' | 'maximize_response';
export type WhatIf = { biopsy_result: BiopsyResult; priority: Priority };

/** Idea #36 – cancer digital twin: the full simulation for one patient. */
export type TwinSimulation = {
  patient_id: string;
  headline: string;
  paths: TreatmentPath[];
  informative_test: string;
  informative_test_reason: string;
  note: string;
  what_if: WhatIf;
  what_if_explanation: string;
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
  // Idea #36 – cancer digital twin.
  twin: (patientId: string, whatIf?: Partial<WhatIf>) =>
    request<TwinSimulation>(`/api/ideas/36/twin/${patientId}?${new URLSearchParams(whatIf as Record<string, string>)}`),
  askTwin: (body: { task: string; patient_id?: string; role?: string }) =>
    request<AgentResult>('/api/ideas/36/ask', { method: 'POST', body: JSON.stringify(body) }),
};
