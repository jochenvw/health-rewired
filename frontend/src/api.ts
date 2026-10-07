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

export type TacitCapture = {
  mode: 'copilot' | 'fallback';
  knowledge_item_id: string;
  concept: string;
  status: string;
  confidence: string;
  decision_type: string;
  case_id: string;
  hospital: string;
  timestamp: string;
  original_explanation: string;
  interpretation: string;
  created_by: string;
  supporting_evidence: number;
  evidence_timing: string;
  review_history: string[];
  result: AgentResult;
};

export type TacitEpisode = {
  episode_id: string;
  hospital: string;
  timestamp: string;
  decision: string;
  similarity: number;
  matched_factors: string[];
  minor_differences: string[];
  missing_context: string[];
  evidence_available_at_decision: string[];
};

export type TacitFactor = {
  concept: string;
  decision_type: string;
  observation_count: number;
  supporting_count: number;
  counterexample_count: number;
  unexplained_relevant_count: number;
  confidence: string;
  status: string;
  representation: string;
  examples: { episode_id: string; hospital: string; decision: string; clinician_explanation: string; available_at_decision: boolean }[];
  counterexamples: { episode_id: string; hospital: string; decision: string; note: string }[];
  review_history: { status: string; detail: string }[];
};

export type TacitAnalysis = {
  synthetic: boolean;
  size: number;
  comparison: {
    current_episode: { episode_id: string; decision: string };
    similarity_method: string;
    cases: TacitEpisode[];
  };
  metrics: {
    episodes_analysed: number;
    comparable_episodes: number;
    decisions_with_post_decision_context: number;
    potentially_missing_context: number;
    unexplained_rate: number;
    unexplained_after_validated_factors: number;
    unexplained_rate_after_validated_factors: number;
    recurring_candidate_factors: number;
    validated_factors: number;
    cases_affected_by_validated_factors: number;
  };
  factors: TacitFactor[];
  analysis_note: string;
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
  captureTacitKnowledge: (explanation: string, decision: string) =>
    request<TacitCapture>('/api/ideas/98/capture', { method: 'POST', body: JSON.stringify({ explanation, decision }) }),
  tacitAnalysis: (validatedConcepts: string[] = [], currentDecision = 'Systemic therapy first', size = 1200) => {
    const query = new URLSearchParams({ size: String(size) });
    validatedConcepts.forEach((concept) => query.append('validated_concepts', concept));
    query.set('current_decision', currentDecision);
    return request<TacitAnalysis>(`/api/ideas/98/analysis?${query.toString()}`);
  },
};
