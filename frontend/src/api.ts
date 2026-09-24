export type Severity = 'info' | 'warning' | 'critical';

export type UIItem = {
  label: string;
  detail?: string | null;
  date?: string | null;
  source?: string | null;
  severity?: Severity | null;
  status?: 'eligible' | 'ineligible' | 'unknown' | null;
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

export type TrialSummary = {
  trial_id: string;
  title: string;
  cancer_type: string;
  key_inclusion: string;
  key_exclusion: string;
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
  trials: () => request<TrialSummary[]>('/api/trials'),
  runAgent: (
    body: {
      task: string;
      patient_id?: string;
      role?: string;
      trial_id?: string;
      treatment?: string;
      subgroup?: string;
      outcome?: string;
      simulate?: boolean;
    },
  ) => request<AgentResult>('/api/agent/run', { method: 'POST', body: JSON.stringify(body) }),
};
