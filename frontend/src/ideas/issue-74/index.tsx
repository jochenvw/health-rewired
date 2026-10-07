import { createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { api, type AgentResult, type EvidenceReviewProposal, type PatientRecord } from '../../api';
import { Avatar, ClinicalShell, Icon, Panel, Pill, ReviewSteps, Segmented, Sparkline, type IconName, type SearchEntry } from './ui';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-74.css';

export const meta: IdeaMeta = {
  id: '74',
  issue: 74,
  title: 'MDT cases, ready to review',
  tagline: 'The patient story is assembled before the tumour board starts.',
};

type CaseStatus = 'scheduled' | 'preparing' | 'prepared' | 'accepted' | 'challenged' | 'returned';
type View = 'worklist' | 'identity' | 'reviewQueue' | 'case' | 'timeline' | 'evidence' | 'completeness' | 'ready';
const reviewViews: View[] = ['case', 'identity', 'timeline', 'evidence', 'reviewQueue'];
type Specialty = 'Oncology' | 'Radiology' | 'Pathology';
type Horizon = 'future' | 'sixMonths';
type IdentityState = 'verified' | 'probable' | 'review' | 'mismatch';
type IdentityDecision = 'confirmed' | 'separate' | 'investigating';
type EvidenceState = 'corroborated' | 'single-source' | 'unverified' | 'contradictory' | 'missing';
type RecoveryState = 'idle' | 'searching' | 'complete';
type EvidenceReview = {
  outcome: 'verified' | 'gap-reviewed' | 'unverified-reviewed' | 'accepted-a' | 'accepted-b' | 'unresolved' | 'investigation';
  rationale: string;
  reviewedAt: string;
  reverted?: boolean;
};
type SourceUpdate = {
  kind: 'correction' | 'addendum';
  reviewOutcome: 'accepted-a' | 'accepted-b';
  source: EvidenceSource;
  originalValue: string;
  reviewedValue: string;
  decision: string;
  context: string;
  status: 'proposed' | 'reviewed' | 'submitted';
  proposedAt: string;
  reviewedAt?: string;
  submittedAt?: string;
};

type EvidenceSource = {
  title: string;
  hospital: string;
  date: string;
  type: string;
  excerpt: string;
  value?: string;
};

type EvidenceAssertion = {
  patientId: string;
  statement: string;
  state: EvidenceState;
  sources: EvidenceSource[];
  explanation: string;
};

type EvidenceReviewContextValue = {
  reviews: Record<string, EvidenceReview>;
  reviewHistory: Record<string, EvidenceReview[]>;
  saveReview: (assertion: EvidenceAssertion, review: EvidenceReview) => void;
  revertReview: (assertion: EvidenceAssertion) => void;
  sourceUpdates: Record<string, SourceUpdate[]>;
  saveSourceUpdate: (assertion: EvidenceAssertion, update: SourceUpdate) => void;
};

const EvidenceReviewContext = createContext<EvidenceReviewContextValue | null>(null);

type IdentityCandidate = {
  id: string;
  hospital: string;
  name: string;
  dob: string;
  localId: string;
  referral: string;
  recordCount: number;
  state: IdentityState;
  evidence: string[];
};

const scheduled = [
  { id: 'P-003', time: '08:30', source: 'Connected · structured record + pathology report' },
  { id: 'P-004', time: '08:45', source: 'Connected · structured record + imaging report' },
  { id: 'P-005', time: '09:00', source: 'Connected · structured record + clinic note' },
  { id: 'P-010', time: '09:15', source: 'Outside hospital · Italian MRI PDF' },
];

const story: StoryStep[] = [
  { id: 'list', title: 'MDT list', explain: 'Four synthetic colorectal cases are scheduled. Their records are still held in different places.' },
  { id: 'acquire', title: 'Gather evidence', explain: 'Prepare all four cases in parallel or prepare one patient; identity and evidence checks stay visible, and missing details remain open.' },
  { id: 'review', title: 'Review a case', explain: 'Work through the case in order: overview, identity, timeline, evidence, then verify the open items. Switch patient in the patient list without leaving this step.' },
  { id: 'completeness', title: 'Check what is missing', explain: 'Check whether the record can answer the MDT question, search for existing evidence, then see what similar synthetic cases suggest asking next.' },
  { id: 'decision', title: 'Ready for MDT', explain: 'See what is still open, then accept the preparation, challenge it or send it back. Every decision can be reverted; the clinical team owns the clinical decision.' },
];

const prepareStages: Stage[] = [
  { label: 'Finding available records', detail: 'Connected sources and one simulated outside-hospital report', ms: 650 },
  { label: 'Checking patient identity', detail: 'Uncertain records stay separate until a clinician reviews them', ms: 650 },
  { label: 'Reading and normalizing evidence', detail: 'Structured records · reports · Italian PDF', ms: 700 },
  { label: 'Building the dated patient timeline', detail: 'Each event remains linked to its evidence source', ms: 700 },
  { label: 'Checking for conflicting evidence', detail: 'Disagreements are shown, never silently resolved', ms: 650 },
  { label: 'Checking for missing evidence', detail: 'Unanswered facts remain open', ms: 650 },
  { label: 'Preparing the MDT evidence view', detail: 'A clinician reviews the package before the meeting', ms: 650 },
];

const specialties: Specialty[] = ['Oncology', 'Radiology', 'Pathology'];

function sourceFor(patientId: string) {
  if (patientId === 'P-010') {
    return {
      label: 'Ospedale Esempio, Italy · outside the shared data layer',
      format: 'MRI report · Italian PDF · simulated for this prototype',
    };
  }
  const source = scheduled.find((item) => item.id === patientId)?.source ?? 'Connected hospital record';
  return { label: `Hospital ${String.fromCharCode(65 + Number(patientId.slice(-1)) - 3)} · connected source`, format: source };
}

function clinicalQuestion(record: PatientRecord) {
  return record.open_questions[0] ?? 'What should the MDT decide next?';
}

function preparedTone(status: CaseStatus): 'neutral' | 'ok' | 'warn' | 'info' {
  if (status === 'accepted') return 'ok';
  if (status === 'challenged' || status === 'returned') return 'warn';
  if (status === 'prepared') return 'info';
  return 'neutral';
}

const identityLabels: Record<IdentityState, string> = {
  verified: 'Verified match',
  probable: 'Probable match',
  review: 'Review required',
  mismatch: 'Mismatch',
};

const evidenceLabels: Record<EvidenceState, string> = {
  corroborated: 'Multiple sources agree',
  'single-source': 'One source found',
  unverified: 'Needs review',
  contradictory: 'Sources disagree',
  missing: 'Not found',
};

const evidenceDescriptions: Record<EvidenceState, string> = {
  corroborated: 'Two or more separate synthetic source records contain materially equivalent information.',
  'single-source': 'One synthetic source contains this information; no independent source is linked.',
  unverified: 'This item has not been checked against an exact source passage.',
  contradictory: 'Available source records report incompatible information. Neither value is selected.',
  missing: 'No available source explicitly states this information.',
};

function reviewKey(assertion: EvidenceAssertion) {
  const content = JSON.stringify({ statement: assertion.statement, sources: assertion.sources });
  let hash = 14695981039346656037n;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= BigInt(content.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `evidence-${hash.toString(16)}`;
}

function reviewStatusLabel(review: EvidenceReview) {
  if (review.reverted) return `Review reverted · back to open · ${review.reviewedAt.slice(0, 10)}`;
  const outcome = review.outcome === 'verified' ? 'Human-verified'
    : review.outcome === 'gap-reviewed' ? 'Gap reviewed · still missing'
      : review.outcome === 'unverified-reviewed' ? 'Review noted · still unverified'
        : review.outcome === 'accepted-a' ? 'Evidence A selected · conflict retained'
          : review.outcome === 'accepted-b' ? 'Evidence B selected · conflict retained'
            : review.outcome === 'unresolved' ? 'Conflict left unresolved'
              : 'Further investigation recorded';
  return `${outcome} · ${review.reviewedAt.slice(0, 10)}`;
}

function loadEvidenceReviews(): Record<string, EvidenceReview> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem('issue74-evidence-reviews') ?? '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored as Record<string, EvidenceReview>
      : {};
  } catch {
    return {};
  }
}

function loadEvidenceReviewHistory(): Record<string, EvidenceReview[]> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem('issue74-evidence-review-history') ?? '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored as Record<string, EvidenceReview[]>
      : {};
  } catch {
    return {};
  }
}

function loadSourceUpdates(): Record<string, SourceUpdate[]> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem('issue74-source-updates') ?? '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored as Record<string, SourceUpdate[]>
      : {};
  } catch {
    return {};
  }
}

function mdtContext(patientId: string) {
  return patientId === 'P-010'
    ? { label: 'First presentation to this MDT', detail: 'External diagnosis is in the record; this first board review focuses on staging evidence and operability.' }
    : { label: 'Follow-up', detail: 'Established case · focus on interval change and the open MDT question.' };
}

function identityCandidates(record: PatientRecord): IdentityCandidate[] {
  const surname = record.name.split(' ').at(-1) ?? record.name;
  const givenName = record.name.split(' ')[0] ?? record.name;
  const ambiguousGivenName = givenName[1]
    ? `${givenName[0]}${givenName[1] === 'e' ? 'a' : 'e'}${givenName.slice(2)}`
    : givenName;
  const syntheticYear = 2026 - record.age;
  const demoReferral = `REF-EU-${record.id.slice(-3)}`;
  return [
    {
      id: 'utrecht',
      hospital: 'Utrecht University Medical Center',
      name: record.name,
      dob: `01 Jan ${syntheticYear} · synthetic`,
      localId: `NL-${record.id.replace('P-', '482')}`,
      referral: demoReferral,
      recordCount: 3,
      state: 'verified',
      evidence: ['Name agrees exactly', 'Synthetic date of birth agrees', 'Referral identifier agrees', 'Local identifier is present'],
    },
    {
      id: 'milan',
      hospital: 'Milan Cancer Centre',
      name: `${surname.toUpperCase()}, ${givenName[0]}.`,
      dob: `01/01/${syntheticYear}`,
      localId: `IT-${record.id.slice(-3)}9431`,
      referral: demoReferral,
      recordCount: 5,
      state: 'probable',
      evidence: ['Date of birth agrees in a different format', 'Referral identifier agrees', 'Name order and abbreviation differ'],
    },
    {
      id: 'tuscany',
      hospital: 'Tuscan Oncology Network',
      name: `${givenName} ${surname}`,
      dob: `01 Jan ${syntheticYear}`,
      localId: 'Not provided',
      referral: demoReferral,
      recordCount: 2,
      state: 'probable',
      evidence: ['Name and synthetic date of birth agree', 'Referral identifier agrees', 'Local identifier is missing'],
    },
    {
      id: 'munich',
      hospital: 'Munich Hospital',
      name: `${givenName} ${surname}`,
      dob: String(syntheticYear),
      localId: 'Unavailable',
      referral: 'Not provided',
      recordCount: 2,
      state: 'review',
      evidence: ['Name is similar', 'Only birth year is available', 'No local or referral identifier to link records'],
    },
    {
      id: 'lyon',
      hospital: 'Lyon Regional Hospital',
      name: `${ambiguousGivenName} ${surname}`,
      dob: `01 Jan ${syntheticYear - 1} · synthetic`,
      localId: 'FR-118204',
      referral: `REF-EU-${record.id.slice(-2)}8`,
      recordCount: 1,
      state: 'review',
      evidence: ['Given name differs by one letter', 'Date of birth is one year earlier', 'Referral identifier is similar but not an exact match'],
    },
  ];
}

function evidenceFor(record: PatientRecord, label: string, statement: string): EvidenceAssertion {
  const baseSource: EvidenceSource = {
    title: 'Oncology patient record',
    hospital: sourceFor(record.id).label,
    date: record.diagnosis.date,
    type: record.id === 'P-010' ? 'Outside record · simulated extraction' : 'Structured synthetic record',
    excerpt: statement,
  };

  if (label.toLowerCase().includes('biomarker') && record.id === 'P-003' && /kras/i.test(statement)) {
    return conflictFor(record);
  }

  if (label === 'Imaging finding') {
    return {
      patientId: record.id,
      statement,
      state: record.imaging?.length ? 'single-source' : 'missing',
      explanation: record.imaging?.length ? 'The imaging finding is explicitly recorded in the synthetic imaging report.' : 'No imaging report is available in the retrieved record.',
      sources: record.imaging?.length ? [{
        title: `${record.imaging.at(-1)?.modality ?? 'Imaging'} report`,
        hospital: sourceFor(record.id).label,
        date: record.imaging.at(-1)?.date ?? record.diagnosis.date,
        type: 'Synthetic radiology report',
        excerpt: record.imaging.at(-1)?.result ?? statement,
      }] : missingAssertion(record, 'Imaging report').sources,
    };
  }

  if (label === 'Comorbidity') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'This history is present in one synthetic patient record.',
      sources: [{ ...baseSource, title: 'Medical history and comorbidities', type: 'Structured oncology record · history section' }],
    };
  }

  if (label === 'Biomarker') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'One synthetic pathology/molecular source currently records this result.',
      sources: [{ ...baseSource, title: 'Molecular pathology result', type: 'Synthetic pathology report' }],
    };
  }

  if (label === 'Disease') {
    return {
      patientId: record.id,
      statement,
      state: 'corroborated',
      explanation: 'The same diagnosis appears in three separate synthetic records. The records are simulated for this demonstration.',
      sources: [
        { title: 'Pathology report', hospital: 'Utrecht University Medical Center', date: record.diagnosis.date, type: 'Synthetic pathology report', excerpt: `“${statement} confirmed on the submitted specimen.”` },
        { title: 'Oncology consultation', hospital: 'Milan Cancer Centre', date: record.diagnosis.date, type: 'Synthetic clinical note', excerpt: `“Assessment: ${statement}.”` },
        { title: 'Referral letter', hospital: 'Tuscan Oncology Network', date: record.diagnosis.date, type: 'Synthetic referral', excerpt: `“Referred for MDT review of ${statement}.”` },
      ],
    };
  }

  if (label === 'Stage / current state') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'This value is explicitly present in the patient record; a second independent staging source is not available in this case.',
      sources: [{ ...baseSource, title: 'Diagnosis and staging record', excerpt: `${record.diagnosis.stage}. ECOG ${record.ecog}. ${record.current_status ?? 'Current status is not explicitly recorded.'}` }],
    };
  }

  if (label === 'Treatments so far') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'These treatment entries come from one synthetic patient record; they are not independently corroborated.',
      sources: [{
        title: 'Treatment history',
        hospital: sourceFor(record.id).label,
        date: record.treatments.at(-1)?.start ?? record.diagnosis.date,
        type: 'Synthetic patient record',
        excerpt: statement,
      }],
    };
  }

  if (label === 'What changed') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'One dated timeline entry supports this update.',
      sources: [{ ...baseSource, title: 'Dated oncology timeline', date: record.timeline.at(-1)?.date ?? record.diagnosis.date, type: 'Synthetic timeline entry' }],
    };
  }

  if (label === 'Question for the MDT') {
    return {
      patientId: record.id,
      statement,
      state: 'single-source',
      explanation: 'This question is recorded as an open item; it is not an AI recommendation.',
      sources: [{ ...baseSource, title: 'Open questions in the patient record', type: 'Synthetic MDT preparation entry' }],
    };
  }

  return {
    patientId: record.id,
    statement,
    state: 'single-source',
    explanation: 'One synthetic source currently supports this statement.',
    sources: [{ ...baseSource, title: label, type: `Structured oncology record · ${label.toLowerCase()} section` }],
  };
}

function treatmentSummary(record: PatientRecord) {
  return record.treatments.map((item) => `${item.regimen} · ${item.status}`).join('; ') || 'No treatment recorded';
}

function currentStateSummary(record: PatientRecord) {
  return `${record.diagnosis.stage} · ${record.current_status ?? 'See latest record entry'}`;
}

function molecularSummary(record: PatientRecord) {
  return Object.entries(record.diagnosis.biomarkers).map(([name, value]) => `${name}: ${value}`).join(' · ');
}

// One canonical assertion per clinical fact, so a human review recorded in any view shows everywhere.
function caseFacts(record: PatientRecord) {
  const scan = record.imaging?.at(-1);
  const molecular = molecularSummary(record);
  return {
    disease: evidenceFor(record, 'Disease', record.diagnosis.primary),
    stage: evidenceFor(record, 'Stage / current state', currentStateSummary(record)),
    treatments: evidenceFor(record, 'Treatments so far', treatmentSummary(record)),
    change: evidenceFor(record, 'What changed', record.timeline.at(-1)?.event ?? 'No recent change recorded'),
    question: evidenceFor(record, 'Question for the MDT', clinicalQuestion(record)),
    molecular: molecular ? evidenceFor(record, 'Biomarker', molecular) : undefined,
    imaging: scan ? evidenceFor(record, 'Imaging finding', scan.result) : undefined,
    comorbidities: record.comorbidities.length ? evidenceFor(record, 'Comorbidity', record.comorbidities.join('; ')) : undefined,
  };
}

type TimelineKind = 'diagnosis' | 'treatment' | 'imaging' | 'lab' | 'event';

function timelineKind(event: string): TimelineKind {
  const text = event.toLowerCase();
  if (text.includes('diagnos') || text.includes('patholog') || text.includes('biopsy')) return 'diagnosis';
  if (/treatment|resection|surgery|chemo|folfox|capox|cycle|radiother/.test(text)) return 'treatment';
  if (/\bct\b|mri|pet|scan|imaging|ultrasound/.test(text)) return 'imaging';
  if (/cea|lab|blood|marker/.test(text)) return 'lab';
  return 'event';
}

function timelineAssertion(record: PatientRecord, event: PatientRecord['timeline'][number]): EvidenceAssertion {
  const kind = timelineKind(event.event);
  if (kind === 'diagnosis' && event.event.toLowerCase().includes('diagnos')) return evidenceFor(record, 'Disease', event.event);
  if (kind === 'treatment') {
    const base = evidenceFor(record, 'Treatments so far', event.event);
    return { ...base, sources: base.sources.map((source) => ({ ...source, date: event.date, excerpt: event.event })) };
  }
  return {
    patientId: record.id,
    statement: event.event,
    state: 'single-source',
    explanation: 'One dated synthetic record entry supports this timeline event.',
    sources: [{ title: 'Dated timeline entry', hospital: sourceFor(record.id).label, date: event.date, type: 'Synthetic source record', excerpt: `“${event.event}”` }],
  };
}

type ReviewGroup = 'conflict' | 'gap' | 'statement' | 'fact' | 'timeline';
type ReviewItem = { label: string; group: ReviewGroup; assertion: EvidenceAssertion };

const reviewGroups: { id: ReviewGroup; label: string; action: string; tone: 'crit' | 'warn' | 'info' | 'neutral' }[] = [
  { id: 'conflict', label: 'Source conflicts', action: 'Reconcile individually · neither value is selected automatically', tone: 'crit' },
  { id: 'gap', label: 'Evidence gaps', action: 'Record the gap as reviewed · the value stays missing', tone: 'warn' },
  { id: 'statement', label: 'Unverified assistant statements', action: 'Record review · no exact source passage is attached', tone: 'warn' },
  { id: 'fact', label: 'Key case facts', action: 'Check the source passage and mark human-verified', tone: 'info' },
  { id: 'timeline', label: 'Timeline events', action: 'Check the dated source entry and mark human-verified', tone: 'neutral' },
];

function generatedAssertions(record: PatientRecord, agentResult?: AgentResult) {
  return agentResult?.blocks.flatMap((block) => [
    ...(block.body ? [generatedAssertion(record, block.body)] : []),
    ...block.items.map((item) => generatedAssertion(record, [item.label, item.detail].filter(Boolean).join(' · '))),
  ]) ?? [];
}

// The single list of reviewable items for a case: queue, attention counts, progress and the agent skill all use it.
function caseReviewItems(record: PatientRecord, horizon: Horizon, agentResult?: AgentResult): ReviewItem[] {
  const facts = caseFacts(record);
  const groupFor = (assertion: EvidenceAssertion, fallback: ReviewGroup): ReviewGroup => (
    assertion.state === 'contradictory' ? 'conflict'
      : assertion.state === 'missing' ? 'gap'
        : assertion.state === 'unverified' ? 'statement'
          : fallback
  );
  const conflict = record.id === 'P-003' && horizon === 'future' ? conflictFor(record) : undefined;
  const raw: { label: string; assertion: EvidenceAssertion; fallback: ReviewGroup }[] = [
    ...(conflict ? [{ label: 'Molecular source disagreement', assertion: conflict, fallback: 'conflict' as const }] : []),
    { label: 'Disease', assertion: facts.disease, fallback: 'fact' },
    { label: 'Stage / current state', assertion: facts.stage, fallback: 'fact' },
    { label: 'Treatments so far', assertion: facts.treatments, fallback: 'fact' },
    { label: 'What changed', assertion: facts.change, fallback: 'fact' },
    { label: 'Question for the MDT', assertion: facts.question, fallback: 'fact' },
    ...(facts.molecular && facts.molecular.state !== 'contradictory' ? [{ label: 'Molecular results', assertion: facts.molecular, fallback: 'fact' as const }] : []),
    ...(facts.imaging ? [{ label: 'Latest imaging finding', assertion: facts.imaging, fallback: 'fact' as const }] : []),
    ...(facts.comorbidities ? [{ label: 'Relevant comorbidities', assertion: facts.comorbidities, fallback: 'fact' as const }] : []),
    ...completenessItems(record, horizon).filter((item) => item.assertion.state !== 'contradictory' || conflict).map((item) => ({ label: item.label, assertion: item.assertion, fallback: 'fact' as const })),
    ...missingEvidenceItems(record, horizon).map((item) => ({ label: item.label, assertion: item.assertion, fallback: 'gap' as const })),
    ...[...(record.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map((event) => ({ label: `Timeline · ${event.date}`, assertion: timelineAssertion(record, event), fallback: 'timeline' as const })),
    ...generatedAssertions(record, agentResult).map((assertion) => ({ label: 'Assistant statement', assertion, fallback: 'statement' as const })),
  ];
  const unique = new Map<string, ReviewItem>();
  raw.forEach(({ label, assertion, fallback }) => {
    const key = reviewKey(assertion);
    if (!unique.has(key)) unique.set(key, { label, assertion, group: groupFor(assertion, fallback) });
  });
  return [...unique.values()];
}

function isPendingReview(assertion: EvidenceAssertion, reviews: Record<string, EvidenceReview>) {
  const outcome = reviews[reviewKey(assertion)]?.outcome;
  if (assertion.state === 'missing') return outcome !== 'gap-reviewed';
  if (assertion.state === 'unverified') return outcome !== 'unverified-reviewed' && outcome !== 'verified';
  if (assertion.state === 'contradictory') return !outcome;
  return outcome !== 'verified';
}

// What "Verify" records: a clinician-verified fact, or a confirmed gap. Conflicts are never verified in bulk.
function verifyOutcome(assertion: EvidenceAssertion): EvidenceReview['outcome'] | undefined {
  return assertion.state === 'missing' ? 'gap-reviewed'
    : assertion.state === 'contradictory' ? undefined
      : 'verified';
}

function openIdentityCandidates(record: PatientRecord, horizon: Horizon, decisions: Record<string, IdentityDecision>) {
  return horizon === 'future'
    ? identityCandidates(record).filter(({ id, state }) => {
        const decision = decisions[`${record.id}:${id}`];
        return (state === 'review' || state === 'probable') && decision !== 'confirmed' && decision !== 'separate';
      })
    : [];
}

type AgentItemStatus = 'queued' | 'checking' | 'ready' | 'none' | 'failed';
type AgentRun = {
  status: 'running' | 'done';
  startedAt: number;
  finishedAt?: number;
  items: { key: string; label: string; group: ReviewGroup; status: AgentItemStatus }[];
  proposals: EvidenceReviewProposal[];
  mode?: 'copilot' | 'fallback';
  note?: string;
  error?: string;
  dismissed: Record<string, boolean>;
};

const syntheticClinicians: Record<string, string> = {
  'P-003': 'Dr. A. Vermeulen · Medical oncology',
  'P-004': 'Dr. L. Bianchi · Colorectal surgery',
  'P-005': 'Dr. M. Keller · Medical oncology',
  'P-010': 'Dr. S. Moretti · Hepatobiliary surgery',
};

export default function TeamDomitian() {
  const [records, setRecords] = useState<Record<string, PatientRecord>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [agentResults, setAgentResults] = useState<Record<string, AgentResult>>({});
  const [statuses, setStatuses] = useState<Record<string, CaseStatus>>(
    Object.fromEntries(scheduled.map(({ id }) => [id, 'scheduled'])),
  );
  const [selectedId, setSelectedId] = useState('P-003');
  const [view, setView] = useState<View>('worklist');
  const [specialty, setSpecialty] = useState<Specialty>('Oncology');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [preparing, setPreparing] = useState(false);
  const [preparationTarget, setPreparationTarget] = useState('all');
  const [requestsDone, setRequestsDone] = useState(false);
  const [notice, setNotice] = useState('');
  const [challenge, setChallenge] = useState('');
  const [identityDecisions, setIdentityDecisions] = useState<Record<string, IdentityDecision>>({});
  const [recoveryStates, setRecoveryStates] = useState<Record<string, RecoveryState>>({});
  const [cohortQuestions, setCohortQuestions] = useState<Record<string, string>>({});
  const [evidenceReviews, setEvidenceReviews] = useState<Record<string, EvidenceReview>>(loadEvidenceReviews);
  const [evidenceReviewHistory, setEvidenceReviewHistory] = useState<Record<string, EvidenceReview[]>>(loadEvidenceReviewHistory);
  const [sourceUpdates, setSourceUpdates] = useState<Record<string, SourceUpdate[]>>(loadSourceUpdates);
  const [evidenceDrawer, setEvidenceDrawer] = useState<EvidenceAssertion | null>(null);
  const [agentRuns, setAgentRuns] = useState<Record<string, AgentRun>>({});
  const [datasetGroups, setDatasetGroups] = useState<{ group: string; elements: { name: string; likely_source: string }[] }[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem('issue74-evidence-reviews', JSON.stringify(evidenceReviews));
    } catch {
      setNotice('Evidence review is recorded for this session, but browser storage is unavailable for later MDT preparations.');
    }
  }, [evidenceReviews]);

  useEffect(() => {
    try {
      window.localStorage.setItem('issue74-evidence-review-history', JSON.stringify(evidenceReviewHistory));
    } catch {
      setNotice('MDT review history is available for this session, but browser storage is unavailable for later preparations.');
    }
  }, [evidenceReviewHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem('issue74-source-updates', JSON.stringify(sourceUpdates));
    } catch {
      setNotice('Source update history is available for this session, but browser storage is unavailable for later MDT preparations.');
    }
  }, [sourceUpdates]);

  useEffect(() => {
    let active = true;
    Promise.all(
      scheduled.map(async ({ id }) => {
        try {
          const record = await api.patient(id);
          if (active) setRecords((current) => ({ ...current, [id]: record }));
        } catch {
          if (active) setLoadErrors((current) => [...current, id]);
        }
      }),
    );
    api
      .sampleData<{ groups: { group: string; elements: { name: string; likely_source: string }[] }[] }>('minimal-mdt-dataset.json')
      .then((data) => {
        if (active) setDatasetGroups(data.groups);
      })
      .catch(() => setDatasetGroups([]));
    return () => {
      active = false;
    };
  }, []);

  const record = records[selectedId];
  const showReadySummary = view === 'ready' && statuses[selectedId] === 'accepted';
  const readyCount = Object.values(statuses).filter((status) => status === 'prepared' || status === 'accepted').length;
  const timeline = useMemo(() => [...(record?.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [record]);
  const storyStep = preparing
    ? 'acquire'
    : view === 'worklist'
      ? 'list'
      : view === 'completeness'
        ? 'completeness'
        : view === 'ready'
          ? 'decision'
          : 'review';

  const prepareAll = async () => {
    if (preparing || Object.keys(records).length < scheduled.length) return;
    setPreparing(true);
    setPreparationTarget('all');
    setRequestsDone(false);
    setView('case');
    setNotice('');
    setStatuses(Object.fromEntries(scheduled.map(({ id }) => [id, 'preparing'])));
    await Promise.all(
      scheduled.map(async ({ id }) => {
        const patient = records[id];
        try {
          const result = await api.runAgent({
            patient_id: id,
            role: 'MDT coordinator',
            task: `Prepare this synthetic colorectal cancer case for tomorrow's MDT. Review identity-linked diagnosis, stage, treatment, recent changes and open questions. Return a short patient-at-a-glance summary, chronological timeline, and source-grounded evidence. Keep uncertain identities separate, preserve contradictory sources without choosing one, and leave missing facts open. Do not infer patient facts or make a clinical decision.`,
          });
          setAgentResults((current) => ({ ...current, [id]: result }));
          setStatuses((current) => ({ ...current, [id]: 'prepared' }));
        } catch {
          setStatuses((current) => ({ ...current, [id]: 'prepared' }));
          setNotice('The assistant could not be reached. The synthetic records and review controls are still available in this demo.');
        }
        if (!patient) setStatuses((current) => ({ ...current, [id]: 'scheduled' }));
      }),
    );
    setRequestsDone(true);
    setView('case');
  };

  const preparePatient = async () => {
    if (preparing || !record) return;
    const patientId = record.id;
    setPreparing(true);
    setPreparationTarget(patientId);
    setRequestsDone(false);
    setView('case');
    setNotice('');
    setStatuses((current) => ({ ...current, [patientId]: 'preparing' }));
    try {
      const result = await api.runAgent({
        patient_id: patientId,
        role: 'MDT coordinator',
        task: `Prepare this synthetic colorectal cancer case for tomorrow's MDT. Review identity-linked evidence, diagnosis, stage, treatment, recent changes and open questions. Return a concise summary, chronological timeline and source-grounded evidence. Keep uncertain identities separate, preserve contradictory sources without choosing one, and leave missing facts open. Do not infer patient facts or make a clinical decision.`,
      });
      setAgentResults((current) => ({ ...current, [patientId]: result }));
      setStatuses((current) => ({ ...current, [patientId]: 'prepared' }));
    } catch {
      setStatuses((current) => ({ ...current, [patientId]: 'prepared' }));
      setNotice('The assistant could not be reached. The synthetic record and review controls are still available in this demo.');
    }
    setRequestsDone(true);
  };

  const goToStoryStep = (id: string) => {
    setNotice('');
    if (id === 'list') setView('worklist');
    if (id === 'acquire') {
      if (scheduled.some(({ id: patientId }) => statuses[patientId] === 'scheduled')) void prepareAll();
      else {
        setView('worklist');
        setNotice('Evidence is already gathered for all four patients. Use “Prepare this patient” in a case to gather it again.');
      }
    }
    if (id === 'review' && !reviewViews.includes(view)) setView('case');
    if (id === 'completeness') setView('completeness');
    if (id === 'decision') setView('ready');
  };

  const searchPatientEvidence = async () => {
    if (!record || recoveryStates[record.id] === 'searching') return;
    const patientId = record.id;
    setRecoveryStates((current) => ({ ...current, [patientId]: 'searching' }));
    await new Promise((resolve) => window.setTimeout(resolve, 2300));
    setRecoveryStates((current) => ({ ...current, [patientId]: 'complete' }));
  };

  const choosePatient = (id: string) => {
    setSelectedId(id);
    if (view === 'worklist') setView('case');
    setNotice('');
    setChallenge('');
  };

  const updateDecision = (status: CaseStatus, message: string) => {
    setStatuses((current) => ({ ...current, [selectedId]: status }));
    setNotice(message);
    if (status === 'challenged') setChallenge('');
  };
  const revertDecision = () => {
    updateDecision('prepared', 'Decision reverted. The preparation is back to draft and can be accepted, challenged or sent back again.');
  };

  const startAgentReview = async (target: PatientRecord) => {
    const patientId = target.id;
    if (agentRuns[patientId]?.status === 'running') return;
    const pendingItems = caseReviewItems(target, horizon, agentResults[patientId]).filter(({ assertion }) => isPendingReview(assertion, evidenceReviews));
    if (!pendingItems.length) return;
    setAgentRuns((current) => ({
      ...current,
      [patientId]: {
        status: 'running',
        startedAt: Date.now(),
        items: pendingItems.map((item) => ({ key: reviewKey(item.assertion), label: item.group === 'statement' ? item.assertion.statement : item.label, group: item.group, status: 'queued' })),
        proposals: [],
        dismissed: {},
      },
    }));
    const updateRun = (change: (run: AgentRun) => AgentRun) => setAgentRuns((current) => (current[patientId] ? { ...current, [patientId]: change(current[patientId]) } : current));
    const batches: ReviewItem[][] = [];
    reviewGroups.forEach((group) => {
      const list = pendingItems.filter((item) => item.group === group.id);
      for (let index = 0; index < list.length; index += 8) batches.push(list.slice(index, index + 8));
    });
    let cursor = 0;
    let failures = 0;
    const worker = async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        const keys = batch.map(({ assertion }) => reviewKey(assertion));
        updateRun((run) => ({ ...run, items: run.items.map((item) => (keys.includes(item.key) ? { ...item, status: 'checking' } : item)) }));
        try {
          const [response] = await Promise.all([
            api.reviewEvidence({
              patient_id: patientId,
              assertions: batch.map(({ label, assertion }) => ({
                key: reviewKey(assertion),
                label,
                statement: assertion.statement,
                state: assertion.state,
                sources: assertion.sources.map(({ title, hospital, date, excerpt, value }) => ({ title, hospital, date, excerpt, value })),
              })),
            }),
            new Promise((resolve) => window.setTimeout(resolve, 900)),
          ]);
          const proposals = response.proposals.filter((proposal) => keys.includes(proposal.assertion_key));
          const received = new Set(proposals.map((proposal) => proposal.assertion_key));
          updateRun((run) => ({
            ...run,
            mode: response.result.mode,
            note: response.result.note ?? run.note,
            proposals: [...run.proposals.filter((proposal) => !received.has(proposal.assertion_key)), ...proposals],
            items: run.items.map((item) => (keys.includes(item.key) ? { ...item, status: received.has(item.key) ? 'ready' : 'none' } : item)),
          }));
        } catch {
          failures += 1;
          updateRun((run) => ({ ...run, items: run.items.map((item) => (keys.includes(item.key) ? { ...item, status: 'failed' } : item)) }));
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    updateRun((run) => ({
      ...run,
      status: 'done',
      finishedAt: Date.now(),
      error: failures ? `The review skill could not be reached for ${failures} batch${failures === 1 ? '' : 'es'}. Those items stay in the review queue for the clinician.` : undefined,
    }));
  };

  const dataReady = Object.keys(records).length === scheduled.length;
  const inspect = (assertion: EvidenceAssertion) => setEvidenceDrawer(assertion);
  const pendingFor = (target?: PatientRecord) => (target ? caseReviewItems(target, horizon, agentResults[target.id]).filter(({ assertion }) => isPendingReview(assertion, evidenceReviews)).length : 0);
  const selectedPending = pendingFor(record);
  const selectedIdentities = record ? openIdentityCandidates(record, horizon, identityDecisions).length : 0;
  const selectedConflict = record && record.id === 'P-003' && horizon === 'future' && isPendingReview(conflictFor(record), evidenceReviews);
  const selectedGaps = record ? missingEvidenceItems(record, horizon).length : 0;

  const openPatientView = (id: string, target: View) => {
    setSelectedId(id);
    setView(target);
    setNotice('');
  };

  const searchEntries: SearchEntry[] = scheduled.flatMap(({ id, time }) => {
    const patient = records[id];
    if (!patient) return [];
    const entries: SearchEntry[] = [
      { id: `${id}-patient`, kind: 'Patient', title: patient.name, detail: `${patient.age} · ${patient.sex} · ${id} · MDT ${time}`, keywords: `${patient.diagnosis.primary} ${patient.diagnosis.stage}`, onSelect: () => openPatientView(id, 'case') },
      { id: `${id}-diagnosis`, kind: 'Diagnosis', title: patient.diagnosis.primary, detail: `${patient.name} · ${patient.diagnosis.stage}`, onSelect: () => openPatientView(id, 'case') },
    ];
    Object.entries(patient.diagnosis.biomarkers).forEach(([marker, value]) => entries.push({ id: `${id}-bio-${marker}`, kind: 'Biomarker', title: `${marker} · ${value}`, detail: patient.name, keywords: 'molecular pathology', onSelect: () => openPatientView(id, 'evidence') }));
    patient.labs.forEach((lab, index) => entries.push({ id: `${id}-lab-${index}`, kind: 'Lab result', title: `${lab.test} ${lab.value} ${lab.unit}${lab.flag ? ` · ${lab.flag}` : ''}`, detail: `${patient.name} · ${lab.date}`, onSelect: () => openPatientView(id, 'case') }));
    (patient.imaging ?? []).forEach((scan, index) => entries.push({ id: `${id}-img-${index}`, kind: 'Imaging', title: `${scan.modality} · ${scan.date}`, detail: `${patient.name} · ${scan.result}`, onSelect: () => openPatientView(id, 'case') }));
    patient.timeline.forEach((event, index) => entries.push({ id: `${id}-tl-${index}`, kind: 'Timeline', title: event.event, detail: `${patient.name} · ${event.date}`, onSelect: () => openPatientView(id, 'timeline') }));
    return entries;
  });

  const reviewTabs = [
    { id: 'case', label: 'Overview' },
    { id: 'identity', label: 'Identity', badge: selectedIdentities || undefined },
    { id: 'timeline', label: 'Timeline' },
    { id: 'evidence', label: 'Evidence', badge: selectedConflict ? '!' : undefined },
    { id: 'reviewQueue', label: 'Review queue', badge: selectedPending || undefined },
  ];
  const workflowStage = (id: string) => {
    const status = statuses[id];
    if (status === 'scheduled') return 'Evidence not gathered';
    if (status === 'preparing') return 'Gathering evidence…';
    if (status === 'accepted') return 'Ready for MDT ✓';
    if (status === 'challenged') return 'Decision · challenged';
    if (status === 'returned') return 'Decision · sent back';
    const pending = pendingFor(records[id]);
    return pending ? `Review · ${pending} open` : 'Reviewed · decision due';
  };

  const agentPanel = record ? (
    <AgentReviewPanel
      record={record}
      horizon={horizon}
      agentResult={agentResults[record.id]}
      run={agentRuns[record.id]}
      onStart={() => void startAgentReview(record)}
      onDismiss={(key) => setAgentRuns((current) => (current[record.id] ? { ...current, [record.id]: { ...current[record.id], dismissed: { ...current[record.id].dismissed, [key]: true } } } : current))}
      onInspect={inspect}
    />
  ) : null;

  const reviewPanel = (
    <Panel title="Your review" eyebrow="Human decision on the preparation" icon="users">
      <p className="issue74-intro">Accepting means this evidence package is suitable for MDT review. It does not approve a diagnosis or treatment; the team keeps every clinical judgment and decision.</p>
      {statuses[selectedId] === 'accepted' ? (
        <div className="issue74-actions">
          <Pill tone="ok">Evidence package accepted for MDT review · no diagnosis or treatment approved</Pill>
          <button className="hx-btn" type="button" onClick={() => setView('ready')}>Open Ready for MDT summary</button>
          <button className="hx-btn" type="button" onClick={revertDecision}>Revert decision</button>
        </div>
      ) : statuses[selectedId] === 'challenged' || statuses[selectedId] === 'returned' ? (
        <div className="issue74-actions">
          <Pill tone="warn">{statuses[selectedId] === 'challenged' ? 'Preparation challenged' : 'Preparation sent back for correction'}</Pill>
          <button className="hx-btn" type="button" onClick={revertDecision}>Revert decision</button>
        </div>
      ) : (
        <div className="issue74-actions">
          <button className="hx-btn primary" type="button" onClick={() => {
            updateDecision('accepted', 'Evidence package accepted as suitable for MDT review. No diagnosis or treatment was approved.');
            setView('ready');
          }}>Accept preparation for MDT review</button>
          <button className="hx-btn" type="button" onClick={() => updateDecision('challenged', 'Tell the team what needs a second look.')}>Challenge</button>
          <button className="hx-btn" type="button" onClick={() => updateDecision('returned', 'Preparation sent back for correction. The source record is unchanged.')}>Send back for correction</button>
        </div>
      )}
      {statuses[selectedId] === 'challenged' && (
        <form className="issue74-challenge" onSubmit={(event) => { event.preventDefault(); setNotice(challenge.trim() ? `Challenge noted: ${challenge}` : 'Add a short note so the team knows what to review.'); }}>
          <label htmlFor="issue74-challenge">What should the team check?</label>
          <textarea id="issue74-challenge" value={challenge} onChange={(event) => setChallenge(event.target.value)} placeholder="For example: confirm the date of the outside MRI report" rows={2} />
          <button className="hx-btn" type="submit">Save review note</button>
        </form>
      )}
    </Panel>
  );

  return (
    <div className="issue74" data-theme={theme}>
      <a className="issue74-skip-link" href="#issue74-main">Skip to case work</a>
      <EvidenceReviewContext.Provider value={{
        reviews: evidenceReviews,
        reviewHistory: evidenceReviewHistory,
        saveReview: (assertion, review) => {
          const key = reviewKey(assertion);
          setEvidenceReviews((current) => ({ ...current, [key]: review }));
          setEvidenceReviewHistory((current) => ({ ...current, [key]: [...(current[key] ?? []), review] }));
        },
        revertReview: (assertion) => {
          const key = reviewKey(assertion);
          const previous = evidenceReviews[key];
          if (!previous) return;
          setEvidenceReviews((current) => Object.fromEntries(Object.entries(current).filter(([itemKey]) => itemKey !== key)));
          setEvidenceReviewHistory((current) => ({ ...current, [key]: [...(current[key] ?? []), { ...previous, rationale: 'Clinician reverted this review; the item is open again.', reviewedAt: new Date().toISOString(), reverted: true }] }));
        },
        sourceUpdates,
        saveSourceUpdate: (assertion, update) => setSourceUpdates((current) => ({
          ...current,
          [reviewKey(assertion)]: [...(current[reviewKey(assertion)] ?? []), update],
        })),
      }}>
      <ClinicalShell
        highlightPatient={view !== 'worklist'}
        patients={scheduled.map(({ id, time }) => ({
          id,
          name: records[id]?.name ?? id,
          meta: `${time} · ${records[id] ? workflowStage(id) : 'Loading…'}`,
          status: statusLabel(statuses[id]),
          tone: preparedTone(statuses[id]),
        }))}
        selectedPatientId={selectedId}
        onPatient={choosePatient}
        search={searchEntries}
        controls={(
          <>
            <Segmented label="Time horizon" value={horizon} onChange={setHorizon} options={[{ id: 'sixMonths', label: 'In six months' }, { id: 'future', label: 'The future' }]} />
            <Segmented label="Colour theme" value={theme} onChange={setTheme} options={[{ id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }]} />
          </>
        )}
        guide={<StoryGuide steps={story} current={storyStep} onGo={goToStoryStep} />}
      >
        <main className="issue74-main" id="issue74-main" tabIndex={-1}>
        {notice && !showReadySummary && <div className="issue74-notice" role="status">{notice}</div>}
        {loadErrors.length > 0 && <div className="issue74-notice issue74-warning">Could not load {loadErrors.join(', ')}. Start the local demo API to open the synthetic records.</div>}
        {preparing && (
          <Panel title={preparationTarget === 'all' ? 'Preparing the scheduled patients in parallel' : `Preparing ${record?.name ?? 'this patient'}`} eyebrow="Copilot SDK · case preparation" icon="spark">
            <Backstage
              title={preparationTarget === 'all' ? 'Assistant work · all four cases' : 'Assistant work · one case'}
              stages={prepareStages}
              running
              holdLast
              release={requestsDone}
              onFinished={() => setPreparing(false)}
              note="The Copilot SDK prepares the synthetic record; the evidence view remains available in demo mode without a Copilot token."
            />
            <div className="issue74-progress-list">
              {scheduled.filter(({ id }) => preparationTarget === 'all' || id === preparationTarget).map(({ id }) => (
                <div key={id}><span>{records[id]?.name ?? id}</span><Pill tone={preparedTone(statuses[id])}>{statusLabel(statuses[id])}</Pill></div>
              ))}
            </div>
          </Panel>
        )}

        {view === 'worklist' && (
          <>
            <section className="issue74-board-head">
              <div>
                <span className="p74-card-eyebrow">Colorectal MDT · Tomorrow, 08:30 · Room 2.14</span>
                <h1>Tumour board preparation</h1>
                <p>Gather the evidence for the whole list before the first case is discussed. Sources and dates remain visible; missing items stay open.</p>
              </div>
              <div className="issue74-board-stats">
                <div><strong>{scheduled.length}</strong><span>Patients</span></div>
                <div><strong>{readyCount}</strong><span>Prepared</span></div>
                <div><strong>{scheduled.reduce((sum, { id }) => sum + pendingFor(records[id]), 0)}</strong><span>Items to review</span></div>
              </div>
            </section>
            <ul className="issue74-board" aria-label="Scheduled patients">
              {scheduled.map(({ id, time, source }) => {
                const patient = records[id];
                const pending = pendingFor(patient);
                const conflict = patient && id === 'P-003' && horizon === 'future' && isPendingReview(conflictFor(patient), evidenceReviews);
                return (
                  <li key={id}>
                    <button type="button" className="issue74-board-card" disabled={!patient} onClick={() => choosePatient(id)}>
                      <span className="issue74-board-time"><Icon name="clock" size={14} />{time}</span>
                      <Avatar name={patient?.name ?? id} size="md" />
                      <span className="issue74-board-name">
                        <strong>{patient?.name ?? 'Loading synthetic record…'}</strong>
                        <small>{patient ? `${patient.age} · ${patient.sex} · ${id}` : id}</small>
                      </span>
                      <span className="issue74-board-dx">
                        <strong>{patient?.diagnosis.primary ?? '—'}</strong>
                        <small>{mdtContext(id).label}</small>
                      </span>
                      <span className="issue74-board-source"><Icon name={id === 'P-010' ? 'link' : 'evidence'} size={14} />{source}</span>
                      <span className="issue74-board-flags">
                        {conflict && <Pill tone="crit">Source conflict</Pill>}
                        {pending > 0 && <Pill tone="warn">{pending} to review</Pill>}
                        <Pill tone={preparedTone(statuses[id])}>{statusLabel(statuses[id])}</Pill>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="issue74-worklist-footer">
              <span>One outside hospital · report in Italian · source remains separately inspectable</span>
              <button className="hx-btn primary" type="button" disabled={!dataReady || preparing} onClick={() => void prepareAll()}>
                {preparing ? <><span className="hx-spinner" aria-hidden /> Working…</> : 'Prepare all four patients'}
              </button>
            </div>
            {horizon === 'sixMonths' && <CoveragePanel groups={datasetGroups} record={record} />}
          </>
        )}

        {view !== 'worklist' && (
          record ? (
            <>
              {!showReadySummary && (
                <section className="issue74-patient-header" aria-label="Patient header">
                  <Avatar name={record.name} size="lg" />
                  <div className="issue74-patient-id">
                    <h1>{record.name}</h1>
                    <p>{record.age} y · {record.sex} · DOB 01 Jan {2026 - record.age} · MRN {record.id}</p>
                    <p className="issue74-patient-dx">{record.diagnosis.primary} · {record.diagnosis.stage}</p>
                    <div className="issue74-patient-alerts">
                      {selectedConflict && <Pill tone="crit">Source conflict</Pill>}
                      {selectedIdentities > 0 && <Pill tone="warn">{selectedIdentities} identity match{selectedIdentities === 1 ? '' : 'es'}</Pill>}
                      {selectedGaps > 0 && <Pill tone="warn">{selectedGaps} evidence gap{selectedGaps === 1 ? '' : 's'}</Pill>}
                      {selectedPending > 0 && <Pill tone="info">{selectedPending} to review</Pill>}
                      {agentResults[record.id] && <Pill tone="ai">Prepared · {agentResults[record.id].mode === 'copilot' ? 'Copilot SDK' : 'demo mode'}</Pill>}
                    </div>
                  </div>
                  <dl className="issue74-patient-meta">
                    <div><dt>MDT slot</dt><dd>Tomorrow {scheduled.find((item) => item.id === record.id)?.time}</dd></div>
                    <div><dt>Responsible</dt><dd>{syntheticClinicians[record.id] ?? 'MDT coordinator'}</dd></div>
                    <div><dt>Preparation</dt><dd><Pill tone={preparedTone(statuses[selectedId])}>{statusLabel(statuses[selectedId])}</Pill></dd></div>
                  </dl>
                  <div className="issue74-patient-actions">
                    <label>
                      <span>Specialty view</span>
                      <select value={specialty} disabled={horizon === 'sixMonths'} onChange={(event) => setSpecialty(event.target.value as Specialty)}>
                        {specialties.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <button className="hx-btn primary" type="button" disabled={preparing} onClick={() => void preparePatient()}>
                      {preparing && preparationTarget === selectedId ? <><span className="hx-spinner" aria-hidden /> Preparing case…</> : 'Prepare this patient'}
                    </button>
                  </div>
                </section>
              )}
              {reviewViews.includes(view) && (
                <ReviewSteps
                  step={3}
                  title="Review a case"
                  tabs={reviewTabs}
                  active={view}
                  onChange={(id) => setView(id as View)}
                  next={{ label: 'Check what is missing', onClick: () => setView('completeness') }}
                />
              )}
              {view === 'ready' && !showReadySummary && (
                <div className="issue74-overview issue74-decision-step">
                  <div className="issue74-overview-main">
                    {reviewPanel}
                    <VerificationProgress record={record} horizon={horizon} agentResult={agentResults[selectedId]} onInspect={inspect} onOpenQueue={() => setView('reviewQueue')} />
                  </div>
                  <aside className="issue74-overview-rail" aria-label="Still open before the MDT">
                    <AttentionPanel record={record} horizon={horizon} decisions={identityDecisions} agentResult={agentResults[selectedId]} onNavigate={setView} onInspect={inspect} />
                  </aside>
                </div>
              )}
              {showReadySummary && <ReadyForMDT
                record={record}
                horizon={horizon}
                decisions={identityDecisions}
                agentResult={agentResults[selectedId]}
                onBack={() => setView('case')}
                onRevert={revertDecision}
                onDrillDown={() => setView('evidence')}
                onInspect={inspect}
              />}
              {view === 'case' && (
                <div className="issue74-overview">
                  <div className="issue74-overview-main">
                    <AtAGlance record={record} agentResult={agentResults[selectedId]} horizon={horizon} onInspect={inspect} />
                    {agentPanel}
                    {horizon === 'sixMonths' && <CoveragePanel groups={datasetGroups} record={record} />}
                  </div>
                  <aside className="issue74-overview-rail" aria-label="Case status">
                    <AttentionPanel record={record} horizon={horizon} decisions={identityDecisions} agentResult={agentResults[selectedId]} onNavigate={setView} onInspect={inspect} />
                    <VerificationProgress record={record} horizon={horizon} agentResult={agentResults[selectedId]} onInspect={inspect} onOpenQueue={() => setView('reviewQueue')} />
                    {horizon === 'future' && (
                      <Panel title={`${specialty} focus`} eyebrow="Same case · different emphasis" icon="stethoscope">
                        <SpecialtyFocus record={record} specialty={specialty} onInspect={inspect} />
                      </Panel>
                    )}
                  </aside>
                </div>
              )}
              {view === 'identity' && (
                <IdentityPanel
                  record={record}
                  horizon={horizon}
                  decisions={identityDecisions}
                  onDecision={(id, decision) => {
                    const decisionKey = `${record.id}:${id}`;
                    if (!decision) {
                      setIdentityDecisions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== decisionKey)));
                      setNotice('Identity decision reverted. The record is held separate again until a clinician decides.');
                      return;
                    }
                    setIdentityDecisions((current) => ({ ...current, [decisionKey]: decision }));
                    const message = decision === 'confirmed'
                      ? 'Human verified: this source can now be considered for this synthetic case.'
                      : decision === 'separate'
                        ? 'This source will remain separate from the patient timeline.'
                        : 'Investigation noted. This source remains separate until a clinician verifies it.';
                    setNotice(message);
                  }}
                />
              )}
              {view === 'reviewQueue' && (
                <BulkEvidenceReview
                  record={record}
                  horizon={horizon}
                  agentResult={agentResults[selectedId]}
                  decisions={identityDecisions}
                  agentPanel={agentPanel}
                  onInspect={inspect}
                  onNavigate={setView}
                />
              )}
              {view === 'timeline' && <TimelinePanel record={record} timeline={timeline} onInspect={inspect} />}
              {view === 'evidence' && <EvidencePanel record={record} agentResult={agentResults[selectedId]} horizon={horizon} onInspect={inspect} />}
              {view === 'completeness' && (
                <CompletenessPanel
                  record={record}
                  horizon={horizon}
                  recoveryState={recoveryStates[selectedId] ?? 'idle'}
                  selectedQuestion={cohortQuestions[selectedId]}
                  onSearch={() => void searchPatientEvidence()}
                  onSelectQuestion={(question) => {
                    setCohortQuestions((current) => ({ ...current, [selectedId]: question }));
                    setNotice('Discussion question added to this synthetic preparation. No test was ordered and no patient fact was changed.');
                  }}
                  onInspect={inspect}
                />
              )}
              {view === 'completeness' && (
                <div className="issue74-step-next">
                  <button className="hx-btn primary" type="button" onClick={() => setView('ready')}>Next: Ready for MDT decision →</button>
                </div>
              )}
              {view !== 'ready' && view !== 'case' && view !== 'reviewQueue' && horizon === 'future' && specialty !== 'Oncology' && <SpecialtyPanel record={record} specialty={specialty} onInspect={inspect} />}
            </>
          ) : (
            <Panel title="Loading synthetic patient record"><span className="hx-working"><span className="hx-spinner" aria-hidden /> Loading the record…</span></Panel>
          )
        )}
        </main>
      </ClinicalShell>
      {evidenceDrawer && <EvidenceDrawer assertion={evidenceDrawer} onClose={() => setEvidenceDrawer(null)} />}
      </EvidenceReviewContext.Provider>
    </div>
  );
}


function statusLabel(status: CaseStatus) {
  return ({
    scheduled: 'Not started',
    preparing: 'Preparing',
    prepared: 'Draft ready',
    accepted: 'Ready for MDT review',
    challenged: 'Needs review',
    returned: 'Sent back',
  })[status];
}

function EvidenceMarker({ state, assertion }: { state: EvidenceState; assertion?: EvidenceAssertion }) {
  const reviews = useContext(EvidenceReviewContext)?.reviews ?? {};
  const review = assertion ? reviews[reviewKey(assertion)] : undefined;
  const sourceCount = assertion?.sources.length ?? 0;
  const support = state === 'corroborated' ? `${sourceCount || 'Multiple'} sources agree`
    : state === 'single-source' ? '1 source'
      : evidenceLabels[state];
  const verified = review?.outcome === 'verified';
  const reconciled = review?.outcome === 'accepted-a' || review?.outcome === 'accepted-b';
  const sourceFact = state === 'corroborated' || state === 'single-source';
  const status = verified ? 'Verified'
    : reconciled ? `Evidence ${review?.outcome === 'accepted-a' ? 'A' : 'B'} selected`
      : review?.outcome === 'gap-reviewed' ? 'Gap reviewed'
        : review?.outcome === 'unverified-reviewed' ? 'Reviewed · unverified'
          : review?.outcome === 'unresolved' ? 'Reviewed · unresolved'
            : review?.outcome === 'investigation' ? 'Investigating'
              : sourceFact ? 'Not yet verified'
                : evidenceLabels[state];
  const tone = verified || reconciled ? 'verified'
    : review ? 'reviewed'
      : state === 'contradictory' ? 'conflict'
        : state === 'missing' ? 'missing'
          : state === 'unverified' ? 'unverified'
            : 'pending';
  const glyph = verified || reconciled ? '✓' : review ? '•' : state === 'contradictory' ? '!' : state === 'missing' ? '–' : state === 'unverified' ? '?' : '';
  const description = `${status}${sourceFact ? ` · ${support}` : ''}. ${evidenceDescriptions[state]}${review ? ` Human review recorded ${review.reviewedAt.slice(0, 10)}.` : ''}`;
  return (
    <span className={`issue74-evidence-state state-${state} mark-${tone}${review ? ' has-review' : ''}${verified ? ' evidence-human-verified' : ''}`} title={description} aria-label={description}>
      {glyph && <span className="mark-glyph" aria-hidden="true">{glyph}</span>}
      <span className="mark-status">{status}</span>
      {sourceFact && assertion && <span className="mark-support" aria-hidden="true">{support}</span>}
    </span>
  );
}

function EvidenceLink({ assertion, onInspect, label }: { assertion: EvidenceAssertion; onInspect: (assertion: EvidenceAssertion) => void; label?: string }) {
  return (
    <button type="button" className="issue74-evidence-link" title={`${assertion.explanation}${assertion.sources[0] ? ` · ${assertion.sources[0].title}, ${assertion.sources[0].hospital}` : ''}`} onClick={() => onInspect(assertion)}>
      {label ?? `View ${assertion.sources.length} source${assertion.sources.length === 1 ? '' : 's'}`}
    </button>
  );
}

function VerificationProgress({ record, horizon, agentResult, onInspect, onOpenQueue }: { record: PatientRecord; horizon: Horizon; agentResult?: AgentResult; onInspect: (assertion: EvidenceAssertion) => void; onOpenQueue: () => void }) {
  const reviewContext = useContext(EvidenceReviewContext);
  const reviews = reviewContext?.reviews ?? {};
  const items = caseReviewItems(record, horizon, agentResult);
  const pending = items.filter(({ assertion }) => isPendingReview(assertion, reviews));
  const done = items.length - pending.length;
  const verified = items.filter(({ assertion }) => reviews[reviewKey(assertion)]?.outcome === 'verified').length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 100;
  const facts = caseFacts(record);
  const keyFacts = [
    { label: 'Disease', assertion: facts.disease },
    { label: 'Stage / current state', assertion: facts.stage },
    { label: 'Treatments so far', assertion: facts.treatments },
    { label: 'What changed', assertion: facts.change },
    { label: 'Question for the MDT', assertion: facts.question },
  ];
  const rows = [
    { id: 'verified', label: 'Human-verified', count: verified, tone: 'ok' },
    ...reviewGroups.map((group) => ({
      id: group.id,
      label: group.id === 'fact' || group.id === 'timeline' ? `${group.label} · awaiting verification` : `${group.label} · open`,
      count: pending.filter((item) => item.group === group.id).length,
      tone: group.tone,
    })),
  ];
  return (
    <Panel title="Verification progress" eyebrow="Human review · not a clinical confidence score" icon="ready" actions={<Pill tone={pending.length ? 'warn' : 'ok'}>{pending.length ? `${pending.length} to review` : 'All reviewed'}</Pill>}>
      <div className="issue74-progress-meter" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} aria-label={`${done} of ${items.length} review actions recorded`}>
        <div><strong>{done}<small> / {items.length}</small></strong><span>review actions recorded</span></div>
        <span className="issue74-meter"><span style={{ width: `${percent}%` }} /></span>
      </div>
      <ul className="issue74-readiness">
        {rows.map((row) => (
          <li key={row.id} className={`readiness-row tone-${row.tone}${row.count === 0 ? ' is-zero' : ''}`}>
            <i aria-hidden="true" />
            <span>{row.label}</span>
            <strong>{row.count}</strong>
          </li>
        ))}
      </ul>
      <button type="button" className="hx-btn" onClick={onOpenQueue}>{pending.length ? `Open review queue · ${pending.length}` : 'Open review history'}</button>
      <details className="issue74-evidence-detail">
        <summary>Evidence status by key fact</summary>
        <div className="issue74-evidence-assertions">
          {keyFacts.map(({ label, assertion }) => (
            <div key={label} className="issue74-assertion-row">
              <strong>{label}</strong>
              <EvidenceMarker state={assertion.state} assertion={assertion} />
              <EvidenceLink assertion={assertion} onInspect={onInspect} />
            </div>
          ))}
        </div>
        <details className="issue74-status-legend">
          <summary>What the labels mean</summary>
          <ul>
            {Object.entries(evidenceDescriptions).map(([state, explanation]) => (
              <li key={state}><strong>{evidenceLabels[state as EvidenceState]}</strong><span>{explanation}</span></li>
            ))}
          </ul>
          <p>Source support (for example “1 source” or “3 sources agree”) describes how sources relate. “Verified” appears only after a clinician confirms the source passage.</p>
        </details>
      </details>
    </Panel>
  );
}
type QueueFilter = 'open' | 'done' | 'all';
const groupShort: Record<ReviewGroup, string> = { conflict: 'Conflict', gap: 'Gap', statement: 'AI statement', fact: 'Key fact', timeline: 'Timeline' };

function BulkEvidenceReview({
  record,
  horizon,
  agentResult,
  decisions,
  agentPanel,
  onInspect,
  onNavigate,
}: {
  record: PatientRecord;
  horizon: Horizon;
  agentResult?: AgentResult;
  decisions: Record<string, IdentityDecision>;
  agentPanel: ReactNode;
  onInspect: (assertion: EvidenceAssertion) => void;
  onNavigate: (view: View) => void;
}) {
  const reviewContext = useContext(EvidenceReviewContext);
  const reviews = reviewContext?.reviews ?? {};
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<QueueFilter>('open');
  const [groupFilter, setGroupFilter] = useState<ReviewGroup | null>(null);
  const [lastBatch, setLastBatch] = useState<ReviewItem[] | null>(null);
  useEffect(() => { setSelected({}); setLastBatch(null); setGroupFilter(null); }, [record.id]);

  const items = caseReviewItems(record, horizon, agentResult);
  const isOpen = ({ assertion }: ReviewItem) => isPendingReview(assertion, reviews);
  const order = (item: ReviewItem) => reviewGroups.findIndex((group) => group.id === item.group);
  const pending = items.filter(isOpen);
  const completed = items.filter((item) => !isOpen(item));
  const rows = (filter === 'open' ? pending : filter === 'done' ? completed : items)
    .filter((item) => !groupFilter || item.group === groupFilter)
    .sort((left, right) => Number(isOpen(right)) - Number(isOpen(left)) || order(left) - order(right));
  const verifiable = rows.filter((item) => isOpen(item) && verifyOutcome(item.assertion));
  const selectedItems = verifiable.filter(({ assertion }) => selected[reviewKey(assertion)]);
  const outstandingIdentities = openIdentityCandidates(record, horizon, decisions);
  const scope = groupFilter ? reviewGroups.find((group) => group.id === groupFilter)?.label.toLowerCase() : 'open items';

  const verify = (list: ReviewItem[]) => {
    const reviewedAt = new Date().toISOString();
    const recorded = list.filter(({ assertion }) => verifyOutcome(assertion));
    recorded.forEach(({ assertion }) => {
      const outcome = verifyOutcome(assertion)!;
      reviewContext?.saveReview(assertion, {
        outcome,
        rationale: outcome === 'gap-reviewed'
          ? 'Clinician confirmed the value is not in the available sources; it stays missing.'
          : 'Clinician verified against the source records or by other means.',
        reviewedAt,
      });
    });
    setSelected({});
    if (recorded.length) setLastBatch(recorded);
  };
  const undo = () => {
    lastBatch?.forEach(({ assertion }) => reviewContext?.revertReview(assertion));
    setLastBatch(null);
  };

  return (
    <>
      <div className="issue74-queue-tiles" aria-label="Review dashboard">
        <button type="button" className={`issue74-queue-tile tone-warn${outstandingIdentities.length ? '' : ' is-zero'}`} onClick={() => onNavigate('identity')}>
          <span>Identity matches</span><strong>{outstandingIdentities.length}</strong><small>Individual decision</small>
        </button>
        {reviewGroups.map((group) => {
          const count = pending.filter((item) => item.group === group.id).length;
          const total = items.filter((item) => item.group === group.id).length;
          return (
            <button key={group.id} type="button" aria-pressed={groupFilter === group.id} className={`issue74-queue-tile tone-${group.tone}${count ? '' : ' is-zero'}${groupFilter === group.id ? ' is-active' : ''}`} onClick={() => setGroupFilter((current) => (current === group.id ? null : group.id))}>
              <span>{group.label}</span><strong>{count}</strong><small>{total ? `${total - count} of ${total} recorded` : 'None in this case'}</small>
            </button>
          );
        })}
      </div>
      {agentPanel}
      <Panel
        title="Review queue"
        eyebrow="Clinician verification · conflicts first"
        icon="queue"
        actions={<Pill tone={pending.length ? 'warn' : 'ok'}>{pending.length ? `${pending.length} open` : 'All recorded'}</Pill>}
      >
        <p className="issue74-review-queue-intro">
          <strong>Verify</strong> records that you checked the item against the source records or by other means: the highest-trust status in this view. Gaps are confirmed as missing; conflicts need an individual reconciliation. Every action can be reverted.
        </p>
        {outstandingIdentities.length > 0 && (
          <div className="issue74-review-queue-identity">
            <div><strong>{outstandingIdentities.length} identity match{outstandingIdentities.length === 1 ? '' : 'es'} need an individual decision</strong><span>Identity cannot be confirmed in bulk.</span></div>
            <button type="button" className="hx-btn" onClick={() => onNavigate('identity')}>Compare identities</button>
          </div>
        )}
        <div className="issue74-queue-toolbar">
          <label className="issue74-review-select-all">
            <input
              type="checkbox"
              checked={verifiable.length > 0 && selectedItems.length === verifiable.length}
              ref={(input) => { if (input) input.indeterminate = selectedItems.length > 0 && selectedItems.length < verifiable.length; }}
              disabled={verifiable.length === 0}
              onChange={(event) => setSelected(event.target.checked ? Object.fromEntries(verifiable.map(({ assertion }) => [reviewKey(assertion), true])) : {})}
            />
            Select all {verifiable.length}
          </label>
          <Segmented<QueueFilter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'open', label: `Open ${pending.length}` },
              { id: 'done', label: `Recorded ${completed.length}` },
              { id: 'all', label: 'All' },
            ]}
          />
          {groupFilter && <button type="button" className="issue74-queue-chip" onClick={() => setGroupFilter(null)}>{reviewGroups.find((group) => group.id === groupFilter)?.label} <span aria-hidden="true">×</span><span className="sr-only">Clear type filter</span></button>}
          <span className="hx-spacer" />
          {selectedItems.length > 0 && <button type="button" className="hx-btn" onClick={() => verify(selectedItems)}>Verify {selectedItems.length} selected</button>}
          <button type="button" className="hx-btn primary" disabled={verifiable.length === 0} onClick={() => verify(verifiable)}>
            <Icon name="check" size={14} /> Verify all {verifiable.length}
          </button>
        </div>
        {lastBatch && (
          <div className="issue74-queue-undo" role="status">
            <Icon name="check" size={14} />
            <span>{lastBatch.length} item{lastBatch.length === 1 ? '' : 's'} recorded as clinician-verified{lastBatch.some(({ assertion }) => assertion.state === 'missing') ? ' (gaps confirmed missing)' : ''}</span>
            <button type="button" className="issue74-revert-link" onClick={undo}>Undo</button>
            <button type="button" className="issue74-queue-undo-close" aria-label="Dismiss" onClick={() => setLastBatch(null)}>×</button>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="issue74-review-queue-empty" role="status">
            <strong>{filter === 'done' ? 'Nothing recorded yet.' : `✓ No ${scope} left to review.`}</strong>
            <span>Missing values and unresolved conflicts stay visible in the case.</span>
          </div>
        ) : (
          <div className="issue74-queue-table-wrap">
            <table className="issue74-queue-table">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Select</span></th>
                  <th scope="col">Item</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Source</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const { label, assertion, group } = item;
                  const key = reviewKey(assertion);
                  const open = isOpen(item);
                  const outcome = verifyOutcome(assertion);
                  const tone = reviewGroups.find((entry) => entry.id === group)?.tone ?? 'neutral';
                  return (
                    <tr key={key} className={`${open ? 'is-open' : 'is-done'}${selected[key] ? ' is-selected' : ''}`}>
                      <td className="cell-check">
                        {open && outcome && <input type="checkbox" aria-label={`Select ${label}`} checked={Boolean(selected[key])} onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))} />}
                      </td>
                      <td className="cell-item">
                        {group !== 'statement' && !assertion.statement.startsWith(label) && <small>{label}</small>}
                        <span title={assertion.statement}>{assertion.statement}</span>
                      </td>
                      <td><span className={`issue74-queue-type tone-${tone}`}>{groupShort[group]}</span></td>
                      <td><EvidenceMarker state={assertion.state} assertion={assertion} /></td>
                      <td>
                        <button type="button" className="issue74-evidence-link" onClick={() => onInspect(assertion)}>
                          {assertion.sources.length} source{assertion.sources.length === 1 ? '' : 's'}
                        </button>
                      </td>
                      <td className="cell-action">
                        {!open ? (
                          <button type="button" className="hx-btn sm" onClick={() => reviewContext?.revertReview(assertion)}>Revert</button>
                        ) : outcome ? (
                          <button type="button" className="hx-btn sm primary" onClick={() => verify([item])}>{outcome === 'gap-reviewed' ? 'Confirm missing' : 'Verify'}</button>
                        ) : (
                          <button type="button" className="hx-btn sm" onClick={() => onInspect(assertion)}>Reconcile</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="issue74-muted">Verification records a clinician check; it does not accept a conflict, fill a gap, confirm an identity or decide care. All evidence is synthetic and source-linked.</p>
      </Panel>
    </>
  );
}

function AttentionPanel({
  record,
  horizon,
  decisions,
  agentResult,
  onNavigate,
  onInspect,
}: {
  record: PatientRecord;
  horizon: Horizon;
  decisions: Record<string, IdentityDecision>;
  agentResult?: AgentResult;
  onNavigate: (view: View) => void;
  onInspect: (assertion: EvidenceAssertion) => void;
}) {
  const reviews = useContext(EvidenceReviewContext)?.reviews ?? {};
  const pending = caseReviewItems(record, horizon, agentResult).filter(({ assertion }) => isPendingReview(assertion, reviews));
  const identities = openIdentityCandidates(record, horizon, decisions);
  const of = (group: ReviewGroup) => pending.filter((item) => item.group === group);
  const conflicts = of('conflict');
  const gaps = of('gap');
  const statements = of('statement');
  const facts = [...of('fact'), ...of('timeline')];
  const rows = [
    ...conflicts.map((item) => ({ key: reviewKey(item.assertion), tone: 'crit', icon: 'alert' as const, title: 'Molecular sources disagree', detail: 'Neither result is selected. Compare both passages.', action: 'Review conflict', onClick: () => onInspect(item.assertion) })),
    ...(identities.length ? [{ key: 'identity', tone: 'warn', icon: 'identity' as const, title: `${identities.length} identity match${identities.length === 1 ? '' : 'es'} to compare`, detail: 'Cross-hospital records stay separate until you decide.', action: 'Compare', onClick: () => onNavigate('identity') }] : []),
    ...(gaps.length ? [{ key: 'gaps', tone: 'warn', icon: 'evidence' as const, title: `${gaps.length} evidence gap${gaps.length === 1 ? '' : 's'}`, detail: 'Missing values are never inferred.', action: 'Next gap', onClick: () => onInspect(gaps[0].assertion) }] : []),
    ...(statements.length ? [{ key: 'statements', tone: 'warn', icon: 'spark' as const, title: `${statements.length} unverified assistant statement${statements.length === 1 ? '' : 's'}`, detail: 'No exact source passage is attached.', action: 'Review', onClick: () => onNavigate('reviewQueue') }] : []),
    ...(facts.length ? [{ key: 'facts', tone: 'info', icon: 'check' as const, title: `${facts.length} source fact${facts.length === 1 ? '' : 's'} to verify`, detail: 'Check the passage, then mark human-verified.', action: 'Open queue', onClick: () => onNavigate('reviewQueue') }] : []),
  ];
  const total = pending.length + identities.length;
  return (
    <Panel title="Requires attention" eyebrow="Prioritised for this MDT" icon="alert" actions={<Pill tone={total ? 'warn' : 'ok'}>{total ? `${total} open` : 'Clear'}</Pill>}>
      {rows.length ? (
        <ul className="issue74-attention-list">
          {rows.map((row) => (
            <li key={row.key} className={`attention-row tone-${row.tone}`}>
              <span className="issue74-attention-symbol"><Icon name={row.icon} size={16} /></span>
              <div><strong>{row.title}</strong><span>{row.detail}</span></div>
              <button type="button" className="issue74-attention-action" onClick={row.onClick}>{row.action}</button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="issue74-attention-clear">
          <span><strong>✓ All review actions are recorded.</strong> Missing values and source disagreements remain visible; this is not a clinical completeness or safety decision.</span>
          <button type="button" className="issue74-attention-action" onClick={() => onNavigate('completeness')}>Check completeness</button>
        </div>
      )}
    </Panel>
  );
}

function AgentReviewPanel({
  record,
  horizon,
  agentResult,
  run,
  onStart,
  onDismiss,
  onInspect,
}: {
  record: PatientRecord;
  horizon: Horizon;
  agentResult?: AgentResult;
  run?: AgentRun;
  onStart: () => void;
  onDismiss: (key: string) => void;
  onInspect: (assertion: EvidenceAssertion) => void;
}) {
  const reviewContext = useContext(EvidenceReviewContext);
  const reviews = reviewContext?.reviews ?? {};
  const [now, setNow] = useState(() => Date.now());
  const running = run?.status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running]);
  const items = caseReviewItems(record, horizon, agentResult);
  const assertionByKey = new Map(items.map((item) => [reviewKey(item.assertion), item]));
  const pendingCount = items.filter(({ assertion }) => isPendingReview(assertion, reviews)).length;
  const checked = run?.items.filter((item) => item.status !== 'queued' && item.status !== 'checking').length ?? 0;
  const total = run?.items.length ?? 0;
  const elapsed = run ? Math.max(0, Math.round(((run.finishedAt ?? now) - run.startedAt) / 1000)) : 0;
  const visibleProposals = (run?.proposals ?? []).filter((proposal) => assertionByKey.has(proposal.assertion_key) && !run?.dismissed[proposal.assertion_key]);
  const isRecorded = (proposal: EvidenceReviewProposal) => reviews[proposal.assertion_key]?.outcome === proposal.outcome;
  const routine = visibleProposals.filter((proposal) => !isRecorded(proposal) && (proposal.outcome === 'verified' || proposal.outcome === 'gap-reviewed' || proposal.outcome === 'unverified-reviewed'));
  const outstanding = visibleProposals.filter((proposal) => !isRecorded(proposal));
  const individual = outstanding.filter((proposal) => !routine.includes(proposal));
  const confirmedCount = visibleProposals.length - outstanding.length;
  const confirm = (proposal: EvidenceReviewProposal) => {
    const item = assertionByKey.get(proposal.assertion_key);
    if (!item) return;
    reviewContext?.saveReview(item.assertion, {
      outcome: proposal.outcome,
      rationale: `Clinician confirmed Copilot proposal: ${proposal.rationale}`,
      reviewedAt: new Date().toISOString(),
    });
  };
  const statusText: Record<AgentItemStatus, string> = { queued: 'Queued', checking: 'Checking sources…', ready: 'Proposal ready', none: 'No proposal · stays with clinician', failed: 'Not reached · stays with clinician' };
  const outcomeLabel = (proposal: EvidenceReviewProposal) => proposal.outcome === 'verified' ? 'Propose: verified'
    : proposal.outcome === 'accepted-a' || proposal.outcome === 'accepted-b' ? `Propose reconciliation: Evidence ${proposal.outcome === 'accepted-a' ? 'A' : 'B'}`
      : proposal.outcome === 'gap-reviewed' ? 'Propose: gap reviewed, keep missing'
        : proposal.outcome === 'unverified-reviewed' ? 'Propose: keep unverified'
          : proposal.outcome === 'unresolved' ? 'Propose: keep conflict unresolved'
            : 'Propose: investigate further';

  const renderProposal = (proposal: EvidenceReviewProposal, compact: boolean) => {
    const item = assertionByKey.get(proposal.assertion_key);
    if (!item) return null;
    const reconciliation = proposal.outcome === 'accepted-a' || proposal.outcome === 'accepted-b';
    const source = proposal.source_index === undefined || proposal.source_index === null ? undefined : item.assertion.sources[proposal.source_index];
    return (
      <li key={proposal.assertion_key} className={reconciliation ? 'proposal-reconcile' : undefined}>
        <div className="issue74-agent-proposal-heading">
          <span><small>{item.label}</small><strong>{item.assertion.statement}</strong></span>
          <Pill tone={reconciliation ? 'crit' : 'ai'}>{outcomeLabel(proposal)}</Pill>
        </div>
        <p><span className="issue74-ai-kind">Evidence</span>{proposal.rationale}</p>
        {source && !compact && <p className="issue74-agent-proposal-sources"><span className="issue74-ai-kind kind-inference">Suggested source</span>{source.title} · {source.hospital}{source.value ? ` · ${source.value}` : ''}</p>}
        <div className="issue74-review-actions">
          <button className="issue74-evidence-link" type="button" onClick={() => onInspect(item.assertion)}>Inspect {item.assertion.sources.length} source{item.assertion.sources.length === 1 ? '' : 's'}</button>
          <span className="hx-spacer" />
          <button className="hx-btn" type="button" onClick={() => onDismiss(proposal.assertion_key)}>Keep for manual review</button>
          <button className={`hx-btn${reconciliation ? '' : ' primary'}`} type="button" onClick={() => confirm(proposal)}>{reconciliation ? 'Confirm reconciliation' : 'Confirm'}</button>
        </div>
      </li>
    );
  };

  return (
    <section className={`issue74-agent-review${running ? ' is-running' : ''}`} aria-labelledby="issue74-agent-review-title">
      <header className="issue74-agent-review-head">
        <span className="issue74-agent-mark"><Icon name="spark" size={18} /></span>
        <div>
          <span className="p74-card-eyebrow">Copilot SDK skill · review, verify, reconcile</span>
          <h2 id="issue74-agent-review-title">Agentic evidence review</h2>
          <p>Copilot checks every open item against its source passages and proposes a review or a reconciliation. Nothing is recorded until you confirm.</p>
        </div>
        <button className="hx-btn primary" type="button" disabled={running || pendingCount === 0} onClick={onStart}>
          {running ? <><span className="hx-spinner" aria-hidden /> Reviewing…</> : pendingCount ? `Start agentic review · ${pendingCount} item${pendingCount === 1 ? '' : 's'}` : 'Nothing left to review'}
        </button>
      </header>

      {run && (
        <div className="issue74-agent-progress">
          <div className="issue74-agent-status" role="status" aria-live="polite">
            {running ? <span className="hx-spinner" aria-hidden /> : <Icon name="check" size={16} />}
            <strong>{running ? 'Agentic review started' : run.error ? 'Agentic review stopped' : 'Agentic review complete'}</strong>
            <span>{checked} of {total} items checked · {elapsed}s{run.mode ? ` · ${run.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo (no Copilot token)'}` : ''}</span>
          </div>
          <span className="issue74-meter" aria-hidden="true"><span style={{ width: `${total ? Math.round((checked / total) * 100) : 0}%` }} /></span>
          <details className="issue74-agent-items" open={running}>
            <summary>Item progress</summary>
            <ol>
              {run.items.map((item) => (
                <li key={item.key} className={`agent-item-${item.status}`}>
                  <span className="agent-item-icon" aria-hidden="true">{item.status === 'checking' ? <span className="hx-spinner" /> : item.status === 'ready' ? '✓' : item.status === 'queued' ? '' : '–'}</span>
                  <span className="agent-item-label" title={item.label}>{item.label}</span>
                  <small>{statusText[item.status]}</small>
                </li>
              ))}
            </ol>
          </details>
          {run.error && <div className="issue74-notice issue74-warning" role="alert">{run.error}</div>}
          {run.note && !running && <p className="issue74-muted">{run.note}</p>}
        </div>
      )}

      {run && visibleProposals.length > 0 && (
        <div className="issue74-agent-review-result" aria-live="polite">
          <div className="issue74-agent-result-bar">
            <div><strong>{outstanding.length ? `${outstanding.length} proposal${outstanding.length === 1 ? '' : 's'} awaiting your confirmation` : 'All proposals handled'}</strong><span>Routine checks can be confirmed together; conflict reconciliations need an individual decision.</span></div>
            {routine.length > 0 && <button className="hx-btn primary" type="button" onClick={() => routine.forEach(confirm)}>Confirm {routine.length} routine proposal{routine.length === 1 ? '' : 's'}</button>}
          </div>
          {individual.length > 0 && (
            <ul className="issue74-agent-proposals">
              {individual.map((proposal) => renderProposal(proposal, false))}
            </ul>
          )}
          {routine.length > 0 && (
            <details className="issue74-agent-routine">
              <summary><strong>{routine.length} routine proposal{routine.length === 1 ? '' : 's'}</strong><span>Source facts to verify, gaps kept missing, statements kept unverified · open to check each one</span></summary>
              <ul className="issue74-agent-proposals is-compact">
                {routine.map((proposal) => renderProposal(proposal, true))}
              </ul>
            </details>
          )}
          {confirmedCount > 0 && <p className="issue74-agent-confirmed"><Icon name="check" size={14} /> {confirmedCount} proposal{confirmedCount === 1 ? '' : 's'} confirmed by the clinician and recorded in the review history.</p>}
          <p className="issue74-muted">Copilot proposes; the clinician decides. A confirmed reconciliation selects a value for this case only; the source disagreement and history are kept.</p>
        </div>
      )}
    </section>
  );
}

function ReadyForMDT({ record, horizon, decisions, agentResult, onBack, onDrillDown, onRevert, onInspect }: {
  record: PatientRecord;
  horizon: Horizon;
  decisions: Record<string, IdentityDecision>;
  agentResult?: AgentResult;
  onBack: () => void;
  onRevert: () => void;
  onDrillDown: () => void;
  onInspect: (assertion: EvidenceAssertion) => void;
}) {
  const reviewContext = useContext(EvidenceReviewContext);
  const reviews = reviewContext?.reviews ?? {};
  const slot = scheduled.find((patient) => patient.id === record.id);
  const conflict = record.id === 'P-003' && horizon === 'future' ? conflictFor(record) : undefined;
  const conflictReview = conflict ? reviews[reviewKey(conflict)] : undefined;
  const conflictReconciled = conflictReview?.outcome === 'accepted-a' || conflictReview?.outcome === 'accepted-b';
  const storedSourceUpdates = conflict ? reviewContext?.sourceUpdates[reviewKey(conflict)] : undefined;
  const sourceUpdate = storedSourceUpdates?.filter((item) => item.reviewOutcome === conflictReview?.outcome).at(-1);
  const completeness = completenessItems(record, horizon);
  const generatedAssertions = agentResult?.blocks.flatMap((block) => [
    ...(block.body ? [generatedAssertion(record, block.body)] : []),
    ...block.items.map((item) => generatedAssertion(record, [item.label, item.detail].filter(Boolean).join(' · '))),
  ]) ?? [];
  const identityCandidatesForRecord = horizon === 'future' ? identityCandidates(record) : [];
  const resolvedIdentity = identityCandidatesForRecord.filter(({ id }) => {
    const decision = decisions[`${record.id}:${id}`];
    return decision === 'confirmed' || decision === 'separate';
  });
  const openIdentity = identityCandidatesForRecord.filter(({ id, state }) => {
    const decision = decisions[`${record.id}:${id}`];
    return (state === 'review' || state === 'probable') && decision !== 'confirmed' && decision !== 'separate';
  });
  const isReconciled = (item: CompletenessItem) => {
    const outcome = reviews[reviewKey(item.assertion)]?.outcome;
    return outcome === 'accepted-a' || outcome === 'accepted-b';
  };
  const resolvedEvidence = completeness.filter((item) => isReconciled(item));
  const openEvidence = completeness.filter((item) => item.state !== 'present' && !isReconciled(item));
  const openItems = [
    ...openEvidence.map((item) => {
      const review = reviews[reviewKey(item.assertion)];
      const status = item.state === 'conflicting'
        ? review ? `Conflict review recorded · ${reviewStatusLabel(review)}` : 'Conflicting sources'
        : review ? 'Review recorded · still missing' : 'Missing';
      return `${item.label} · ${status}: ${item.detail}`;
    }),
    ...(conflict && !conflictReconciled && !openEvidence.some((item) => item.state === 'conflicting')
      ? [`Molecular source disagreement · ${conflictReview ? `review recorded · ${reviewStatusLabel(conflictReview)}` : 'not reconciled'}: neither result is selected.`]
      : []),
    ...openIdentity.map((candidate) => `Identity · ${candidate.hospital} · ${decisions[`${record.id}:${candidate.id}`] === 'investigating' ? 'investigation noted · ' : ''}match remains uncertain.`),
    ...generatedAssertions.filter((assertion) => reviews[reviewKey(assertion)]?.outcome !== 'verified').map((assertion) => `Unverified statement · ${reviews[reviewKey(assertion)] ? 'review noted · still unverified' : 'no exact source linked'}: ${assertion.statement}`),
    ...(conflictReconciled && sourceUpdate?.status !== 'submitted'
      ? [`Source feedback · ${sourceUpdate ? sourceUpdate.status === 'reviewed' ? 'proposal reviewed · simulated submission remains' : 'proposal needs review' : 'update has not been proposed'} · source record remains unchanged.`]
      : []),
  ];
  const confirmedEvidence = completeness.filter((item) => reviews[reviewKey(item.assertion)]?.outcome === 'verified');
  const resolvedItems = [
    ...resolvedIdentity.map((candidate) => `Identity · ${candidate.hospital}: ${decisions[`${record.id}:${candidate.id}`] === 'confirmed' ? 'confirmed as the same patient' : 'kept separate'}.`),
    ...resolvedEvidence.map((item) => `${item.label}: ${reviews[reviewKey(item.assertion)]?.outcome === 'accepted-a' ? 'Evidence A selected' : 'Evidence B selected'} for this preparation.`),
    ...confirmedEvidence.map((item) => `${item.label}: source check recorded.`),
    ...(() => {
      const verifiedStatements = generatedAssertions.filter((assertion) => reviews[reviewKey(assertion)]?.outcome === 'verified').length;
      return verifiedStatements ? [`${verifiedStatements} assistant statement${verifiedStatements === 1 ? '' : 's'} verified by a clinician against the records.`] : [];
    })(),
    ...(conflictReconciled ? [`MDT resolution reused: ${conflict?.sources[conflictReview?.outcome === 'accepted-a' ? 0 : 1].value ?? 'selected source result'} · source disagreement retained.`] : []),
    ...(sourceUpdate?.status === 'submitted'
      ? [`${sourceUpdate.kind === 'correction' ? 'Correction' : 'Addendum'} feedback recorded as a simulated submission · source record unchanged.`]
      : []),
  ];
  const treatments = record.treatments.map((treatment) => `${treatment.regimen} · ${treatment.status}`).join('; ') || 'No treatment recorded';
  const recentChange = record.timeline.at(-1)?.event ?? 'No recent change recorded';
  const currentState = record.current_status ?? 'See latest record entry';
  const question = clinicalQuestion(record);
  const provenance: { label: string; assertion: EvidenceAssertion }[] = [
    { label: 'Diagnosis', assertion: evidenceFor(record, 'Disease', record.diagnosis.primary) },
    { label: 'Stage and current state', assertion: evidenceFor(record, 'Stage / current state', `${record.diagnosis.stage} · ${currentState}`) },
    { label: 'Treatment history', assertion: evidenceFor(record, 'Treatments so far', treatments) },
    { label: 'What changed', assertion: evidenceFor(record, 'What changed', recentChange) },
    { label: 'MDT question', assertion: evidenceFor(record, 'Question for the MDT', question) },
  ];
  return (
    <section className="issue74-ready" aria-labelledby="issue74-ready-title">
      <div className="issue74-ready-banner">
        <span className="issue74-ready-check" aria-hidden="true">✓</span>
        <div>
          <span className="issue74-eyebrow">PREPARATION STATUS · HUMAN REVIEW RECORDED</span>
          <h1 id="issue74-ready-title">Ready for MDT review</h1>
          <p>Prepared for discussion · clinical interpretation and decisions remain with the MDT.</p>
        </div>
        <Pill tone="ok">Accepted for review</Pill>
      </div>
      <div className="issue74-ready-patient">
        <div><span className="issue74-eyebrow">PATIENT</span><strong>{record.name}</strong><span>{record.id} · age {record.age}</span></div>
        <div><span className="issue74-eyebrow">MDT SLOT</span><strong>{slot?.time ?? 'Scheduled'}</strong><span>Colorectal MDT · tomorrow</span></div>
      </div>
      <section className="issue74-ready-summary" aria-label="Patient at a glance">
        <h2>Patient at a glance</h2>
        <div className="issue74-ready-facts">
          <div><span className="issue74-eyebrow">DIAGNOSIS</span><strong>{record.diagnosis.primary}</strong></div>
          <div><span className="issue74-eyebrow">STAGE · CURRENT STATE</span><strong>{record.diagnosis.stage} · {currentState}</strong></div>
          <div><span className="issue74-eyebrow">TREATMENT HISTORY</span><strong>{treatments}</strong></div>
          <div><span className="issue74-eyebrow">WHAT CHANGED</span><strong>{recentChange}</strong></div>
        </div>
        <div className="issue74-ready-question">
          <span className="issue74-eyebrow">QUESTION FOR THE MDT</span>
          <strong>{question}</strong>
        </div>
      </section>
      <div className="issue74-ready-outcomes">
        <section className="issue74-ready-resolved" aria-labelledby="issue74-ready-resolved-title">
          <h2 id="issue74-ready-resolved-title">Resolved during preparation</h2>
          {resolvedItems.length > 0
            ? <ul>{resolvedItems.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
            : <p>No identity match or evidence conflict was resolved during this preparation.</p>}
        </section>
        <section className={`issue74-ready-open${openItems.length ? ' has-open-items' : ''}`} aria-labelledby="issue74-ready-open-title">
          <h2 id="issue74-ready-open-title">{openItems.length ? `Still open · ${openItems.length}` : 'Still open · none flagged'}</h2>
          {openItems.length > 0
            ? <ul>{openItems.map((item) => <li key={item}>{item}</li>)}</ul>
            : <p>No missing, ambiguous or unresolved evidence is flagged by this synthetic check.</p>}
          <p className="issue74-ready-caveat">Recorded review does not make missing or uncertain evidence clinically resolved.</p>
        </section>
      </div>
      <details className="issue74-ready-provenance">
        <summary>Inspect source evidence</summary>
        <div>
          {provenance.map(({ label, assertion }) => (
            <div key={label}><strong>{label}</strong><span className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></span></div>
          ))}
        </div>
      </details>
      <div className="issue74-ready-actions">
        <button className="hx-btn" type="button" onClick={onBack}>Back to case review</button>
        <button className="hx-btn" type="button" onClick={onRevert}>Revert ready for MDT</button>
        <button className="hx-btn primary" type="button" onClick={onDrillDown}>Open evidence and gaps</button>
      </div>
    </section>
  );
}

function IdentityPanel({
  record,
  horizon,
  decisions,
  onDecision,
}: {
  record: PatientRecord;
  horizon: Horizon;
  decisions: Record<string, IdentityDecision>;
  onDecision: (id: string, decision: IdentityDecision | null) => void;
}) {
  const candidates = identityCandidates(record);
  const verified = candidates.filter((candidate) => candidate.state === 'verified').length;
  return (
    <Panel title="Patient identity · before records join the timeline" actions={<Pill tone="info">{verified} verified match · 4 not auto-linked</Pill>}>
      <p className="issue74-intro">Synthetic identity matching across participating hospitals. Identity confidence answers “same person?”—it is separate from evidence support for clinical facts.</p>
      {horizon === 'sixMonths' && <div className="issue74-future-only"><strong>Future capability · not in six months</strong><span>Cross-hospital patient-level retrieval and identity matching need the richer platform. Candidate cards below are a simulated preview, not available from the minimal dataset alone.</span></div>}
      <div className="issue74-identity-current">
        <span className="issue74-eyebrow">CURRENT SYNTHETIC PATIENT</span>
        <strong>{record.name}</strong>
        <span>{record.id} · age {record.age} · DOB not in source record</span>
        <span>Search complete · simulated fan-out to five hospital records <span aria-hidden="true">↓</span></span>
      </div>
      <p className="issue74-identity-assumption">Demo-only comparison: hospital DOB fields are synthetic values generated for this walkthrough; the sample patient record itself contains age, not date of birth.</p>
      <div className="issue74-identity-fanout" aria-label="Simulated hospital search results">
        {candidates.map((candidate) => <div key={candidate.id}><span aria-hidden="true">↓</span><strong>{candidate.hospital.split(' ')[0]}</strong><small>{candidate.recordCount} records returned</small></div>)}
      </div>
      <div className="issue74-identity-grid">
        {candidates.map((candidate) => {
          const decision = decisions[`${record.id}:${candidate.id}`];
          const status = decision === 'confirmed' ? 'verified' : candidate.state;
          const resolved = decision === 'confirmed' || decision === 'separate';
          return (
            <article key={candidate.id} className={`issue74-identity-card identity-${status}${resolved ? ' identity-resolved' : ''}${horizon === 'sixMonths' ? ' identity-future-locked' : ''}`}>
              <header>
                <strong>{decision === 'confirmed' ? '✓ Same patient confirmed' : decision === 'separate' ? '✓ Kept separate · review complete' : decision === 'investigating' ? 'Investigation in progress' : identityLabels[status]}</strong>
                <span>{candidate.hospital}</span>
              </header>
              <div className="issue74-identity-details">
                <strong>{candidate.name}</strong>
                <span>DOB: {candidate.dob}</span>
                <span>Local ID: {candidate.localId}</span>
                <span>Referral: {candidate.referral}</span>
                {candidate.state === 'review' && <span className="identity-reason">{candidate.evidence[0]}</span>}
              </div>
              <details>
                <summary>Compare identity evidence</summary>
                <ul>{candidate.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                <div className="issue74-identity-comparison">
                  <span>Selected patient</span><strong>{record.name} · age {record.age}</strong>
                  <span>{candidate.hospital}</span><strong>{candidate.name} · {candidate.dob}</strong>
                  <span>Referral link</span><strong>{candidate.referral}</strong>
                </div>
              </details>
              {horizon === 'future' && (candidate.state === 'review' || candidate.state === 'probable') && (!decision || decision === 'investigating') && (
                <div className="issue74-identity-actions">
                  <button className="hx-btn primary" type="button" onClick={() => onDecision(candidate.id, 'confirmed')}>Confirm same patient</button>
                  <button className="hx-btn" type="button" onClick={() => onDecision(candidate.id, 'separate')}>Keep separate</button>
                  {!decision && <button className="hx-btn" type="button" onClick={() => onDecision(candidate.id, 'investigating')}>Investigate</button>}
                </div>
              )}
              {decision === 'separate' && <p className="identity-decision">Kept separate · not added to this timeline</p>}
              {decision && <button className="issue74-revert-link" type="button" onClick={() => onDecision(candidate.id, null)}>Revert identity decision</button>}
              {decision === 'investigating' && <p className="identity-decision">Investigation noted · remains separate until verified</p>}
              {candidate.state !== 'review' && !decision && <p className="identity-decision">{candidate.state === 'mismatch' ? 'Not linked to this patient' : candidate.state === 'probable' ? 'Held separate until a clinician confirms' : 'Included in the synthetic verified set'}</p>}
            </article>
          );
        })}
      </div>
      <p className="issue74-identity-boundary">Only the verified match and records a clinician confirms can be considered for this patient's longitudinal history. Probable, review-required and mismatched records are not silently merged. Names, identifiers and DOBs above are synthetic demo values.</p>
    </Panel>
  );
}

function EvidenceDrawer({ assertion, onClose }: { assertion: EvidenceAssertion; onClose: () => void }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => setSourceIndex(0), [assertion]);
  useEffect(() => setSourceOpen(false), [assertion, sourceIndex]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const source = assertion.sources[sourceIndex];
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="issue74-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="issue74-evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="issue74-evidence-title" onKeyDown={keepFocusInside}>
        <header>
          <div><span className="issue74-eyebrow">INSPECTABLE BY DESIGN · SYNTHETIC SOURCE</span><h2 id="issue74-evidence-title">Evidence</h2></div>
          <button ref={closeButton} type="button" className="hx-btn" aria-label="Close evidence drawer" onClick={onClose}>Close</button>
        </header>
        <h3>{assertion.statement}</h3>
        <EvidenceMarker state={assertion.state} assertion={assertion} />
        <p>{assertion.explanation}</p>
        <div className="issue74-source-tabs" aria-label="Evidence sources">
          {assertion.sources.map((item, index) => <button type="button" key={`${item.title}-${item.hospital}`} aria-pressed={index === sourceIndex} onClick={() => setSourceIndex(index)}>{index + 1}. {item.title}</button>)}
        </div>
        {source && (
          <article className="issue74-source-preview">
            <span className="issue74-eyebrow">{source.type.includes('Generated') ? 'GENERATED ASSERTION · SOURCE NOT VERIFIED' : 'SYNTHETIC SOURCE PREVIEW'}</span>
            <h3>{source.title}</h3>
            <dl><dt>Hospital</dt><dd>{source.hospital}</dd><dt>Date</dt><dd>{source.date}</dd><dt>Record type</dt><dd>{source.type}</dd></dl>
            <h4>{source.type.includes('Generated') ? 'Source check' : 'Supporting passage'}</h4>
            <blockquote>{source.excerpt}</blockquote>
            <button type="button" className="hx-btn" onClick={() => setSourceOpen(true)}>{source.type.includes('Generated') ? 'Open readable record context' : 'Open source document'}</button>
            {sourceOpen && <div className="issue74-opened-source" role="status"><strong>{source.title} · {source.hospital}</strong><span>{source.date} · {source.type}</span><p>Original passage</p><blockquote>{source.excerpt}</blockquote><span>The passage supporting “{assertion.statement}” is highlighted. This is a simulated synthetic source document.</span></div>}
          </article>
        )}
        <div className="issue74-normalized">
          <span className="issue74-eyebrow">NORMALIZED ASSERTION</span>
          <strong>{assertion.statement}</strong>
          <span>{assertion.sources.length} source{assertion.sources.length === 1 ? '' : 's'} linked · no real hospital was contacted</span>
        </div>
        <EvidenceReviewControls assertion={assertion} />
      </aside>
    </div>
  );
}

function EvidenceReviewControls({ assertion }: { assertion: EvidenceAssertion }) {
  const reviewContext = useContext(EvidenceReviewContext);
  const [rationale, setRationale] = useState('');
  const currentReview = reviewContext?.reviews[reviewKey(assertion)];
  useEffect(() => setRationale(currentReview?.rationale ?? ''), [assertion, currentReview?.rationale]);

  const save = (outcome: EvidenceReview['outcome']) => {
    reviewContext?.saveReview(assertion, {
      outcome,
      rationale: rationale.trim(),
      reviewedAt: new Date().toISOString(),
    });
  };

  return (
    <section className="issue74-review-controls" aria-label="Human evidence review">
      <span className="issue74-eyebrow">HUMAN REVIEW · SAVED IN THIS BROWSER FOR FUTURE MDT PREPARATIONS</span>
      {assertion.state === 'contradictory' ? (
        <>
          <p>Compare both source passages above. The system does not select a result.</p>
          <label>Review rationale (optional)<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={2} placeholder="Record why this evidence was selected, deferred or needs follow-up" /></label>
          <div className="issue74-review-actions">
            <button type="button" className="hx-btn" onClick={() => save('accepted-a')}>Select Evidence A for this case</button>
            <button type="button" className="hx-btn" onClick={() => save('accepted-b')}>Select Evidence B for this case</button>
            <button type="button" className="hx-btn" onClick={() => save('unresolved')}>Keep unresolved</button>
            <button type="button" className="hx-btn" onClick={() => save('investigation')}>Further investigation required</button>
          </div>
        </>
      ) : assertion.state === 'missing' ? (
        <>
          <p>Review confirms that this value remains absent; it does not verify a patient fact.</p>
          <label>Review rationale (optional)<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={2} placeholder="Record what sources or fields were checked" /></label>
          <button type="button" className="hx-btn" onClick={() => save('gap-reviewed')}>Record gap reviewed · keep unresolved</button>
        </>
      ) : assertion.state === 'unverified' ? (
        <>
          <p>No exact source passage is attached. Verify only if you checked it against the source records or by other means; otherwise record that it stays unverified.</p>
          <label>Review rationale (optional)<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={2} placeholder="Record what you checked, for example: confirmed in the hospital record" /></label>
          <div className="issue74-review-actions">
            <button type="button" className="hx-btn primary" onClick={() => save('verified')}>Verify · I checked this statement</button>
            <button type="button" className="hx-btn" onClick={() => save('unverified-reviewed')}>Keep unverified</button>
          </div>
        </>
      ) : (
        <>
          <p>Review the highlighted source passage; confirming it is a human action, not an automated confidence score.</p>
          <label>Review rationale (optional)<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={2} placeholder="Add a note about what you checked" /></label>
          <button type="button" className="hx-btn primary" onClick={() => save('verified')}>{currentReview?.outcome === 'verified' ? 'Update verification record' : 'Mark evidence as human-verified'}</button>
        </>
      )}
      {(currentReview?.outcome === 'accepted-a' || currentReview?.outcome === 'accepted-b') && (
        <SourceRecordUpdate assertion={assertion} review={currentReview} />
      )}
      {currentReview && (
        <p className={`issue74-review-receipt review-outcome-${currentReview.outcome}`} role="status">
          {currentReview.outcome === 'verified' ? 'Human-verified evidence' :
            currentReview.outcome === 'gap-reviewed' ? 'Gap reviewed; value remains missing' :
              currentReview.outcome === 'unverified-reviewed' ? 'Review recorded; source remains unverified' :
            currentReview.outcome === 'accepted-a' ? 'Evidence A selected for this preparation; disagreement retained' :
              currentReview.outcome === 'accepted-b' ? 'Evidence B selected for this preparation; disagreement retained' :
                currentReview.outcome === 'unresolved' ? 'Conflict kept unresolved' : 'Further investigation recorded'}
          {' · '}{new Date(currentReview.reviewedAt).toLocaleString()}
          {currentReview.rationale && <> · Rationale: {currentReview.rationale}</>}
          {' '}<button type="button" className="issue74-revert-link" onClick={() => reviewContext?.revertReview(assertion)}>Revert</button>
        </p>
      )}
    </section>
  );
}

function SourceRecordUpdate({ assertion, review }: { assertion: EvidenceAssertion; review: EvidenceReview }) {
  const reviewContext = useContext(EvidenceReviewContext);
  const key = reviewKey(assertion);
  const savedUpdate = reviewContext?.sourceUpdates[key]?.filter((item) => item.reviewOutcome === review.outcome).at(-1);
  const acceptedIndex = review.outcome === 'accepted-a' ? 0 : 1;
  const sourceIndex = acceptedIndex === 0 ? 1 : 0;
  const acceptedSource = assertion.sources[acceptedIndex];
  const source = assertion.sources[sourceIndex];
  const [kind, setKind] = useState<SourceUpdate['kind']>(savedUpdate?.kind ?? 'correction');
  const [reviewedValue, setReviewedValue] = useState(savedUpdate?.reviewedValue ?? acceptedSource.value ?? acceptedSource.excerpt);
  const [decision, setDecision] = useState(savedUpdate?.decision ?? `${acceptedSource.value ?? acceptedSource.excerpt} selected for this preparation.`);
  const [context, setContext] = useState(savedUpdate?.context ?? review.rationale);

  useEffect(() => {
    setKind(savedUpdate?.kind ?? 'correction');
    setReviewedValue(savedUpdate?.reviewedValue ?? acceptedSource.value ?? acceptedSource.excerpt);
    setDecision(savedUpdate?.decision ?? `${acceptedSource.value ?? acceptedSource.excerpt} selected for this preparation.`);
    setContext(savedUpdate?.context ?? review.rationale);
  }, [key, review.outcome, savedUpdate?.proposedAt]);

  const status = savedUpdate?.status ?? 'proposed';
  const locked = status !== 'proposed';
  const saveUpdate = (nextStatus: SourceUpdate['status']) => {
    const now = new Date().toISOString();
    reviewContext?.saveSourceUpdate(assertion, {
      kind,
      reviewOutcome: review.outcome as 'accepted-a' | 'accepted-b',
      source,
      originalValue: source.value ?? source.excerpt,
      reviewedValue: reviewedValue.trim(),
      decision: decision.trim(),
      context: context.trim(),
      status: nextStatus,
      proposedAt: nextStatus === 'proposed' ? now : savedUpdate?.proposedAt ?? now,
      reviewedAt: nextStatus === 'reviewed' ? now : nextStatus === 'submitted' ? savedUpdate?.reviewedAt : undefined,
      submittedAt: nextStatus === 'submitted' ? now : undefined,
    });
  };

  return (
    <section className="issue74-source-update" aria-labelledby="issue74-source-update-title">
      <header>
        <div><span className="issue74-eyebrow">MDT DECISION · SOURCE FEEDBACK</span><h4 id="issue74-source-update-title">Update source record</h4></div>
        <Pill tone={status === 'submitted' ? 'ok' : status === 'reviewed' ? 'info' : 'warn'}>
          {status === 'submitted' ? 'Submission simulated' : status === 'reviewed' ? 'Proposal reviewed' : 'Update proposed'}
        </Pill>
      </header>
      <p className="issue74-source-update-boundary">Prototype only · no EHR/EMR is connected and no source record is changed.</p>
      <label>
        Update type
        <select value={kind} disabled={locked} onChange={(event) => setKind(event.target.value as SourceUpdate['kind'])}>
          <option value="correction">Correction · source value was incorrect</option>
          <option value="addendum">Addendum · preserve earlier context</option>
        </select>
      </label>
      <div className="issue74-source-update-values">
        <div className={kind === 'correction' ? 'superseded' : 'historical'}>
          <span className="issue74-eyebrow">ORIGINAL SOURCE VALUE · {kind === 'correction' ? 'SUPERSEDED IN THIS MDT REVIEW' : 'RETAINED AS HISTORICAL'}</span>
          <strong>{source.value ?? source.excerpt}</strong>
          <small>{source.title} · {source.hospital} · {source.date}</small>
        </div>
        <div className="current">
          <span className="issue74-eyebrow">MDT-REVIEWED VALUE / CONTEXT</span>
          <input aria-label="MDT-reviewed value or addendum" value={reviewedValue} disabled={locked} onChange={(event) => setReviewedValue(event.target.value)} />
          <small>{kind === 'correction' ? 'Proposed corrected value · source remains unchanged until an actual integrated workflow accepts it.' : 'Proposed addendum · original observation remains in the clinical history.'}</small>
        </div>
      </div>
      <label>
        MDT decision
        <input value={decision} disabled={locked} onChange={(event) => setDecision(event.target.value)} />
      </label>
      <label>
        MDT context and reason · required
        <textarea value={context} disabled={locked} onChange={(event) => setContext(event.target.value)} rows={2} placeholder="Why did the MDT reach this conclusion? Include relevant clinical context." />
      </label>
      <div className="issue74-source-update-provenance">
        <strong>Provenance</strong>
        <span>Original source: {source.title} · {source.hospital} · {source.date}</span>
        <span>Resolution: {review.outcome === 'accepted-a' ? 'Evidence A selected' : 'Evidence B selected'} · {review.reviewedAt.slice(0, 10)}</span>
        <span>MDT rationale: {context || 'Not yet entered'}</span>
      </div>
      {status !== 'proposed' && (
        <p className="issue74-source-update-receipt" role="status">
          {status === 'submitted'
            ? `Simulated submission recorded ${savedUpdate?.submittedAt ? new Date(savedUpdate.submittedAt).toLocaleString() : ''}. The original source record is unchanged.`
            : `Proposal reviewed ${savedUpdate?.reviewedAt ? new Date(savedUpdate.reviewedAt).toLocaleString() : ''}.`}
        </p>
      )}
      <div className="issue74-review-actions">
        {status === 'proposed' ? (
          <button type="button" className="hx-btn primary" disabled={!reviewedValue.trim() || !decision.trim() || !context.trim()} onClick={() => saveUpdate('reviewed')}>Review proposed update</button>
        ) : status === 'reviewed' ? (
          <>
            <button type="button" className="hx-btn primary" onClick={() => saveUpdate('submitted')}>Simulate submit to source system</button>
            <button type="button" className="hx-btn" onClick={() => saveUpdate('proposed')}>Edit proposal</button>
          </>
        ) : (
          <button type="button" className="hx-btn" onClick={() => saveUpdate('proposed')}>Revise proposal</button>
        )}
      </div>
    </section>
  );
}

function AssistantEvidence({ record, result, onInspect }: { record: PatientRecord; result: AgentResult; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <div className="issue74-agent-blocks">
      {result.blocks.map((block, blockIndex) => (
        <section className="issue74-agent-block" key={`${block.title}-${blockIndex}`}>
          <h4>{block.title}</h4>
          {block.body && (
            <div className="issue74-agent-item">
              <div><strong>{block.body}</strong></div>
              <div className="issue74-fact-evidence">
                <EvidenceMarker state="unverified" assertion={generatedAssertion(record, block.body)} />
                <EvidenceLink assertion={generatedAssertion(record, block.body)} onInspect={onInspect} label="Check source" />
              </div>
            </div>
          )}
          {block.items.map((item, itemIndex) => {
            const assertion = generatedAssertion(record, [item.label, item.detail].filter(Boolean).join(' · '));
            return (
              <div className="issue74-agent-item" key={`${item.label}-${itemIndex}`}>
                <div><strong>[{blockIndex + itemIndex + 1}] {item.label}</strong>{item.detail && <span>{item.detail}</span>}</div>
                <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} label="Inspect source context" /></div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ClinicalSnapshot({ record }: { record: PatientRecord }) {
  const byTest = new Map<string, PatientRecord['labs']>();
  [...record.labs].sort((a, b) => a.date.localeCompare(b.date)).forEach((lab) => byTest.set(lab.test, [...(byTest.get(lab.test) ?? []), lab]));
  const cea = byTest.get('CEA') ?? [];
  const latestCea = cea.at(-1);
  const previousCea = cea.at(-2);
  const trend = latestCea && previousCea ? latestCea.value - previousCea.value : 0;
  const otherLabs = [...byTest.entries()].filter(([test]) => test !== 'CEA').map(([, labs]) => labs.at(-1)).filter((lab): lab is PatientRecord['labs'][number] => Boolean(lab));
  const scan = record.imaging?.at(-1);
  return (
    <div className="issue74-snapshot" aria-label="Clinical snapshot">
      <article className="issue74-metric">
        <span className="issue74-metric-label"><Icon name="drop" size={15} /> CEA · tumour marker</span>
        {latestCea ? (
          <>
            <div className="issue74-metric-value">
              <strong>{latestCea.value}</strong><span>{latestCea.unit}</span>
              {previousCea && <em className={trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-flat'} aria-label={`${trend > 0 ? 'Up' : trend < 0 ? 'Down' : 'No change'} from ${previousCea.value}`}>{trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend).toFixed(1)}</em>}
            </div>
            <Sparkline values={cea.map((lab) => lab.value)} label={`CEA trend: ${cea.map((lab) => lab.value).join(', ')} ${latestCea.unit}`} />
            <small>{latestCea.date}{cea.length > 1 ? ` · ${cea.length} measurements` : ''}{latestCea.flag ? ` · ${latestCea.flag}` : ''} · ref {latestCea.ref}</small>
          </>
        ) : <small>No CEA result in this record.</small>}
      </article>
      <article className="issue74-metric">
        <span className="issue74-metric-label"><Icon name="flask" size={15} /> Stage · performance</span>
        <div className="issue74-metric-value"><strong className="is-text">{record.diagnosis.stage.split('(')[0].trim()}</strong></div>
        <div className="issue74-metric-chips"><Pill tone="neutral">ECOG {record.ecog}</Pill>{record.diagnosis.grade !== undefined && <Pill tone="neutral">Grade {record.diagnosis.grade}</Pill>}</div>
        <small>{record.current_status ?? 'Current status not explicitly recorded'}</small>
      </article>
      <article className="issue74-metric">
        <span className="issue74-metric-label"><Icon name="drop" size={15} /> Latest labs</span>
        {otherLabs.length ? (
          <ul className="issue74-lab-list">
            {otherLabs.map((lab) => <li key={lab.test} className={lab.flag ? `lab-${lab.flag}` : ''}><span>{lab.test}</span><strong>{lab.value} <small>{lab.unit}</small></strong>{lab.flag && <em>{lab.flag === 'high' ? '↑' : lab.flag === 'low' ? '↓' : lab.flag}</em>}</li>)}
          </ul>
        ) : <small>No other laboratory results in this record.</small>}
      </article>
      <article className="issue74-metric issue74-imaging-card">
        <span className="issue74-metric-label"><Icon name="image" size={15} /> Latest imaging</span>
        {scan ? (
          <div className="issue74-imaging">
            <span className="issue74-imaging-thumb" aria-hidden="true"><i /></span>
            <div><strong>{scan.modality}</strong><small>{scan.date}</small><span>{scan.result}</span><Pill tone="info">Report only · images not reviewed</Pill></div>
          </div>
        ) : (
          <div className="issue74-imaging">
            <span className="issue74-imaging-thumb is-empty" aria-hidden="true"><Icon name="image" size={22} /></span>
            <div><strong>No imaging report</strong><span>{record.id === 'P-003' ? 'A surveillance CT is mentioned in the timeline; its report is not in this record.' : 'Not present in the retrieved record.'}</span><Pill tone="warn">Missing</Pill></div>
          </div>
        )}
      </article>
    </div>
  );
}

function AiNotes({ record, horizon }: { record: PatientRecord; horizon: Horizon }) {
  const cea = record.labs.filter((lab) => lab.test === 'CEA').sort((a, b) => a.date.localeCompare(b.date));
  const flagged = [...record.labs].sort((a, b) => b.date.localeCompare(a.date)).find((lab) => lab.flag === 'high');
  const notes: { kind: 'Observation' | 'Evidence' | 'Gap'; text: string }[] = [];
  if (cea.length >= 2 && (cea.at(-1)?.value ?? 0) > (cea[0]?.value ?? 0)) {
    notes.push({ kind: 'Observation', text: `CEA rose from ${cea[0].value} to ${cea.at(-1)?.value} ${cea[0].unit} across ${cea.length} measurements (${cea[0].date} → ${cea.at(-1)?.date}).` });
  } else if (flagged) {
    notes.push({ kind: 'Observation', text: `${flagged.test} ${flagged.value} ${flagged.unit} is above the reference range (${flagged.ref}) on ${flagged.date}.` });
  }
  if (record.id === 'P-003' && horizon === 'future') notes.push({ kind: 'Evidence', text: 'The Utrecht pathology addendum (KRAS G12D) and the Milan referral letter (KRAS wild type) disagree. Neither is selected.' });
  else if (record.id === 'P-010' && horizon === 'future') notes.push({ kind: 'Evidence', text: 'The outside Italian MRI report describes the liver lesions but does not state resectability.' });
  else notes.push({ kind: 'Evidence', text: `The diagnosis is stated consistently in ${caseFacts(record).disease.sources.length} synthetic source records.` });
  const gap = missingEvidenceItems(record, horizon)[0];
  if (gap) notes.push({ kind: 'Gap', text: `${gap.label.replace(/\.$/, '')} · not found in the available sources; it stays open.` });
  return (
    <section className="issue74-ai-notes" aria-label="Copilot notes">
      <header><Icon name="spark" size={15} /><strong>Copilot notes</strong><span>Derived from the synthetic record · no recommendation</span></header>
      <ul>
        {notes.map((note) => <li key={note.text}><span className={`issue74-ai-kind kind-${note.kind.toLowerCase()}`}>{note.kind}</span>{note.text}</li>)}
      </ul>
    </section>
  );
}

function AtAGlance({ record, agentResult, horizon, onInspect }: { record: PatientRecord; agentResult?: AgentResult; horizon: Horizon; onInspect: (assertion: EvidenceAssertion) => void }) {
  const context = mdtContext(record.id);
  const reviews = useContext(EvidenceReviewContext)?.reviews ?? {};
  const facts = caseFacts(record);
  const molecularConflict = record.id === 'P-003' && horizon === 'future' ? conflictFor(record) : undefined;
  const molecularReview = molecularConflict ? reviews[reviewKey(molecularConflict)] : undefined;
  const molecularResolution = molecularReview?.outcome === 'accepted-a' || molecularReview?.outcome === 'accepted-b'
    ? molecularConflict?.sources[molecularReview.outcome === 'accepted-a' ? 0 : 1]
    : undefined;
  return (
    <>
      <ClinicalSnapshot record={record} />
      <Panel
        title="Patient at a glance"
        eyebrow="What the MDT needs to know"
        icon="overview"
        actions={<Pill tone={agentResult?.mode === 'copilot' ? 'ai' : agentResult ? 'neutral' : 'warn'}>{agentResult ? (agentResult.mode === 'copilot' ? 'Prepared with Copilot' : 'Demo mode · synthetic record') : 'Preparation not started'}</Pill>}
      >
        <div className="issue74-mdt-context"><Pill tone={record.id === 'P-010' ? 'info' : 'neutral'}>{context.label}</Pill><span>{context.detail}</span></div>
        <div className="issue74-question-card">
          <span className="p74-card-eyebrow">Question for the MDT</span>
          <strong>{clinicalQuestion(record)}</strong>
          <div className="issue74-fact-evidence"><EvidenceMarker state={facts.question.state} assertion={facts.question} /><EvidenceLink assertion={facts.question} onInspect={onInspect} /></div>
        </div>
        <div className="issue74-glance">
          <Fact label="Disease" value={record.diagnosis.primary} assertion={facts.disease} onInspect={onInspect} />
          <Fact label="Stage / current state" value={currentStateSummary(record)} assertion={facts.stage} onInspect={onInspect} />
          <Fact label="Treatments so far" value={treatmentSummary(record)} assertion={facts.treatments} onInspect={onInspect} />
          <Fact label="What changed" value={record.timeline.at(-1)?.event ?? 'No recent change recorded'} assertion={facts.change} onInspect={onInspect} />
        </div>
        <AiNotes record={record} horizon={horizon} />
      </Panel>
      <Panel title="Molecular, imaging and history" eyebrow="Source-linked case context" icon="flask">
        <div className="issue74-extra-facts">
          {facts.molecular && (
            <Fact
              label={molecularResolution ? 'Original source biomarkers' : 'Molecular results'}
              value={molecularSummary(record)}
              assertion={molecularConflict ?? facts.molecular}
              onInspect={onInspect}
            />
          )}
          {molecularResolution && molecularConflict && <Fact
            label="MDT-reviewed molecular result · reused"
            value={`${molecularResolution.value} · ${molecularReview ? reviewStatusLabel(molecularReview) : 'previously reviewed'}`}
            assertion={molecularConflict}
            onInspect={onInspect}
          />}
          {facts.imaging && record.imaging?.length && <Fact label="Imaging finding" value={`${record.imaging.at(-1)?.modality} · ${record.imaging.at(-1)?.date}: ${record.imaging.at(-1)?.result}`} assertion={facts.imaging} onInspect={onInspect} />}
          {facts.comorbidities && <Fact label="Relevant comorbidities" value={record.comorbidities.join('; ')} assertion={facts.comorbidities} onInspect={onInspect} />}
        </div>
      </Panel>
      {agentResult && (
        <details className="issue74-agent-details">
          <summary>Open the assistant's preparation pass · {agentResult.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
          <p>{agentResult.note ?? 'The assistant used the synthetic sample record. Review the source before relying on any extracted fact.'}</p>
          <p className="issue74-cited-draft">
            {record.name} has {record.diagnosis.primary} <EvidenceLink assertion={facts.disease} onInspect={onInspect} label="[1]" />.
            {' '}Treatment to date: {treatmentSummary(record)} <EvidenceLink assertion={facts.treatments} onInspect={onInspect} label="[2]" />.
          </p>
          <AssistantEvidence record={record} result={agentResult} onInspect={onInspect} />
        </details>
      )}
    </>
  );
}

function Fact({ label, value, assertion, onInspect }: { label: string; value: string; assertion: EvidenceAssertion; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <div className="issue74-fact">
      <span className="issue74-fact-label">{label}</span>
      <strong>{value}</strong>
      <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div>
    </div>
  );
}

function SpecialtyFocus({ record, specialty, onInspect }: { record: PatientRecord; specialty: Specialty; onInspect: (assertion: EvidenceAssertion) => void }) {
  const facts = caseFacts(record);
  if (specialty === 'Radiology') {
    const scan = record.imaging?.at(-1);
    const assertion = facts.imaging ?? missingAssertion(record, 'Imaging report');
    return <div className="issue74-specialty"><p>{scan ? `${scan.modality} · ${scan.date}: ${scan.result}` : 'No imaging report is present in the retrieved record.'} <strong>Direct review of images remains a human task.</strong></p><div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div></div>;
  }
  if (specialty === 'Pathology') {
    const biomarkers = molecularSummary(record);
    const assertion = facts.molecular ?? missingAssertion(record, 'Molecular results');
    return <div className="issue74-specialty"><p>{record.diagnosis.primary}{record.diagnosis.grade ? ` · grade ${record.diagnosis.grade}` : ''}. Biomarkers recorded: {biomarkers || 'none found'}.</p><div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div></div>;
  }
  const assertion = facts.stage;
  return <div className="issue74-specialty"><p>{record.diagnosis.stage} · ECOG {record.ecog}. {record.treatments.at(-1)?.regimen ?? 'No treatment recorded'}; MDT question: {clinicalQuestion(record)}</p><div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div></div>;
}

function SpecialtyPanel({ record, specialty, onInspect }: { record: PatientRecord; specialty: Specialty; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <Panel title={`${specialty} view · same prepared case`}>
      <SpecialtyFocus record={record} specialty={specialty} onInspect={onInspect} />
      <p className="issue74-muted">This changes what is foregrounded, not the source record or the clinical decision.</p>
    </Panel>
  );
}

const timelineIcons: Record<TimelineKind, IconName> = { diagnosis: 'flask', treatment: 'pill', imaging: 'image', lab: 'drop', event: 'dot' };

function TimelinePanel({ record, timeline, onInspect }: { record: PatientRecord; timeline: PatientRecord['timeline']; onInspect: (assertion: EvidenceAssertion) => void }) {
  const reviewContext = useContext(EvidenceReviewContext);
  const conflict = record.id === 'P-003' ? conflictFor(record) : undefined;
  const review = conflict ? reviewContext?.reviews[reviewKey(conflict)] : undefined;
  const reviewHistory = conflict
    ? reviewContext?.reviewHistory[reviewKey(conflict)] ?? (review ? [review] : [])
    : [];
  const storedUpdates = conflict ? reviewContext?.sourceUpdates[reviewKey(conflict)] : undefined;
  const updateVersions = [...new Map((storedUpdates ?? []).map((item) => [`${item.reviewOutcome}-${item.proposedAt}`, item])).values()]
    .sort((a, b) => a.proposedAt.localeCompare(b.proposedAt));
  const sourceUpdate = updateVersions.filter((item) => item.reviewOutcome === review?.outcome).at(-1) ?? updateVersions.at(-1);
  const sourceUpdateIsEarlierResolution = Boolean(sourceUpdate && sourceUpdate.reviewOutcome !== review?.outcome);
  const originalRecords = [...new Map(updateVersions.map((item) => [`${item.source.title}-${item.originalValue}`, item])).values()];
  const updateEventCount = updateVersions.reduce((count, update) => count + 1 + (update.reviewedAt ? 1 : 0) + (update.submittedAt ? 1 : 0), 0);
  const totalEvents = timeline.length + originalRecords.length + updateEventCount + reviewHistory.length;
  return (
    <Panel title="Longitudinal clinical timeline" actions={<Pill tone="info">{totalEvents} dated events</Pill>}>
      <p className="issue74-intro">Each event shows when it happened, the source that supports it, its evidence state and human-review status. Open the source for its passage.</p>
      <ol className="issue74-timeline">
        {timeline.map((event) => {
          const assertion = timelineAssertion(record, event);
          const kind = timelineKind(event.event);
          return (
            <li key={`${event.date}-${event.event}`} className={`timeline-kind-${kind}${assertion.state === 'contradictory' ? ' timeline-contradiction' : ''}`}>
              <span className="issue74-timeline-icon" aria-hidden="true"><Icon name={timelineIcons[kind]} size={15} /></span>
              <time>{event.date}</time>
              <div>
                <strong>{event.event}</strong>
                <small className="issue74-timeline-source">{assertion.sources[0]?.hospital} · {assertion.sources[0]?.title}</small>
                <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} assertion={assertion} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div>
              </div>
            </li>
          );
        })}
      </ol>
      {reviewHistory.length > 0 && conflict && (
        <section className="issue74-timeline-update" aria-labelledby="issue74-review-history-title">
          <header>
            <div><span className="issue74-eyebrow">PERSISTED MDT CONTEXT · SYNTHETIC CASE</span><h3 id="issue74-review-history-title">Resolution history</h3></div>
            <Pill tone="info">{reviewHistory.length} review{reviewHistory.length === 1 ? '' : 's'}</Pill>
          </header>
          <ol>
            {reviewHistory.map((item, index) => {
              const chosenIndex = item.outcome === 'accepted-a' ? 0 : item.outcome === 'accepted-b' ? 1 : undefined;
              const result = chosenIndex === undefined ? reviewStatusLabel(item) : `${conflict.sources[chosenIndex].value} selected · ${reviewStatusLabel(item)}`;
              return (
                <li key={`${item.reviewedAt}-${index}`}>
                  <time>{new Date(item.reviewedAt).toLocaleDateString()}</time>
                  <div><strong>{result}</strong><span>{item.rationale || 'No additional rationale recorded.'}</span><small>{chosenIndex === undefined ? 'Conflict remains unresolved' : `Based on ${conflict.sources[chosenIndex].title} · ${conflict.sources[chosenIndex].hospital}`}</small></div>
                </li>
              );
            })}
          </ol>
          <div className="issue74-fact-evidence"><span>Original disagreement remains available</span><EvidenceLink assertion={conflict} onInspect={onInspect} label="Inspect source evidence" /></div>
        </section>
      )}
      {sourceUpdate && conflict && (
        <section className={`issue74-timeline-update ${sourceUpdate.status === 'submitted' ? 'update-submitted' : ''}`} aria-labelledby="issue74-timeline-update-title">
          <header>
            <div><span className="issue74-eyebrow">APPENDED DATA-QUALITY HISTORY</span><h3 id="issue74-timeline-update-title">MDT review · source feedback</h3></div>
            <Pill tone={sourceUpdateIsEarlierResolution ? 'neutral' : sourceUpdate.status === 'submitted' ? 'ok' : 'info'}>{sourceUpdateIsEarlierResolution ? 'Earlier resolution' : sourceUpdate.status === 'submitted' ? 'Submission simulated' : sourceUpdate.status === 'reviewed' ? 'Proposal reviewed' : 'Update proposed'}</Pill>
          </header>
          <ol>
            {originalRecords.map((update, index) => {
              const latestForSource = updateVersions.filter((item) => item.source.title === update.source.title && item.originalValue === update.originalValue).at(-1) ?? update;
              return <li key={`source-${index}`}>
                <time>{update.source.date}</time>
                <div><strong>{update.source.title} · original observation</strong><span>{update.originalValue}</span><small>{latestForSource.kind === 'correction' ? `SUPERSEDED BY → ${latestForSource.reviewedValue} · SOURCE RECORD UNCHANGED` : `INTERPRETED BY LATER MDT ADDENDUM → ${latestForSource.reviewedValue} · ORIGINAL RETAINED`}</small></div>
              </li>;
            })}
            {updateVersions.flatMap((update, index) => [
              <li key={`proposal-${index}`}>
                <time>{new Date(update.proposedAt).toLocaleDateString()}</time>
                <div><strong>{update.kind === 'correction' ? 'Correction proposed' : 'MDT addendum proposed'} · {update.reviewedValue}</strong><span>{update.status === 'submitted' ? 'Append-only proposal retained in history.' : 'Not written to the source system.'}</span><small>{update.kind === 'correction' ? 'MDT-REVIEWED VALUE · source unchanged' : 'MDT-REVIEWED INTERPRETATION · original observation retained'}</small></div>
              </li>,
              ...(update.reviewedAt ? [<li key={`review-${index}`}>
                <time>{new Date(update.reviewedAt).toLocaleDateString()}</time>
                <div><strong>MDT resolution reviewed · {update.decision}</strong><span>{update.context}</span><small>Based on {review?.outcome === 'accepted-a' ? 'Evidence A' : 'Evidence B'} · synthetic session</small></div>
              </li>] : []),
              ...(update.submittedAt ? [<li key={`submission-${index}`}>
                <time>{new Date(update.submittedAt).toLocaleDateString()}</time>
                <div><strong>Source-system submission simulated</strong><span>The source system was not changed.</span><small>Prototype interaction only</small></div>
              </li>] : []),
            ])}
          </ol>
          <div className="issue74-fact-evidence">
            <span>Provenance chain · {sourceUpdate.source.hospital} · {sourceUpdate.source.title}</span>
            <EvidenceLink assertion={conflict} onInspect={onInspect} label="Inspect original sources" />
          </div>
        </section>
      )}
      {record.id === 'P-010' && <ItalianReport record={record} onInspect={onInspect} />}
    </Panel>
  );
}

function ItalianReport({ record, onInspect }: { record: PatientRecord; onInspect: (assertion: EvidenceAssertion) => void }) {
  const assertion: EvidenceAssertion = {
    patientId: record.id,
    statement: 'Resectability is not stated',
    state: 'missing',
    explanation: 'The simulated Italian MRI report mentions the liver lesions but does not state resectability.',
    sources: [{
      title: 'MRI liver report · simulated Italian PDF',
      hospital: 'Ospedale Esempio, Italy · outside the shared data layer',
      date: record.imaging?.at(-1)?.date ?? record.diagnosis.date,
      type: 'Synthetic outside-hospital report · Italian',
      excerpt: '“Le lesioni epatiche note sono descritte; la resecabilità non è specificata nel referto.”',
    }],
  };
  return (
    <div className="issue74-source-card">
      <div><Pill tone="warn">Outside source · simulated PDF</Pill><span> Italian · MRI liver report · Ospedale Esempio</span></div>
      <p className="issue74-eyebrow">SOURCE PASSAGE · ITALIAN</p>
      <blockquote lang="it">“Le lesioni epatiche note sono descritte; la resecabilità non è specificata nel referto.”</blockquote>
      <p><strong>Working extraction:</strong> Liver lesions mentioned. Resectability is not stated; direct image review is still needed.</p>
      <p className="issue74-muted">This is one simulated source record; its authority has not been ranked against any other evidence. No image or outside hospital was contacted.</p>
      <EvidenceLink assertion={assertion} onInspect={onInspect} label="View report source" />
    </div>
  );
}

function missingAssertion(record: PatientRecord, statement: string): EvidenceAssertion {
  return {
    patientId: record.id,
    statement,
    state: 'missing',
    explanation: 'No available source explicitly states this fact. The system has not inferred an answer.',
    sources: [{
      title: 'Sources searched',
      hospital: sourceFor(record.id).label,
      date: 'Current MDT preparation',
      type: 'Synthetic retrieval result',
      excerpt: 'No explicit statement found in the available reports. Direct specialist review remains open.',
    }],
  };
}

function generatedAssertion(record: PatientRecord, statement: string): EvidenceAssertion {
  const treatment = record.treatments.at(-1);
  const timeline = record.timeline.slice(-2).map((event) => `${event.date}: ${event.event}`).join(' · ');
  return {
    patientId: record.id,
    statement,
    state: 'unverified',
    explanation: 'This generated text has no exact cited passage. The linked patient record is provided for manual checking, not as confirmation.',
    sources: [{
      title: 'Oncology record context · exact passage not attached',
      hospital: sourceFor(record.id).label,
      date: record.diagnosis.date,
      type: 'Generated assertion · synthetic record context, no verbatim citation',
      excerpt: `No verbatim supporting passage is attached. Record context: ${record.diagnosis.primary}; stage ${record.diagnosis.stage}; ${treatment?.regimen ?? 'no treatment recorded'}. Latest dated entries: ${timeline || 'none recorded'}. Open the corresponding synthetic oncology record and check the relevant section.`,
    }],
  };
}

function conflictFor(record: PatientRecord): EvidenceAssertion {
  const biomarker = Object.entries(record.diagnosis.biomarkers).find(([key]) => /ras|braf/i.test(key));
  const actual = biomarker ? `${biomarker[0]} ${biomarker[1]}` : 'KRAS G12D';
  return {
    patientId: record.id,
    statement: `Molecular result needs reconciliation · ${actual}`,
    state: 'contradictory',
    explanation: 'Two clearly labelled synthetic source excerpts disagree. Neither result is selected or reconciled; clinical review is required.',
    sources: [
      { title: 'Pathology molecular addendum · Evidence A', hospital: 'Utrecht University Medical Center', date: record.diagnosis.date, type: 'Synthetic pathology report', excerpt: `${actual} detected in the synthetic pathology addendum.`, value: actual },
      { title: 'Outside referral letter · Evidence B', hospital: 'Milan Cancer Centre', date: record.diagnosis.date, type: 'Synthetic referral · intentionally conflicting demo value', excerpt: 'The referral letter lists KRAS wild type. This conflicts with the pathology addendum. Both source records remain available for clinician review.', value: 'KRAS wild type' },
    ],
  };
}

function ConflictCard({ record, onInspect }: { record: PatientRecord; onInspect: (assertion: EvidenceAssertion) => void }) {
  const assertion = conflictFor(record);
  const review = useContext(EvidenceReviewContext)?.reviews[reviewKey(assertion)];
  const selected = review?.outcome === 'accepted-a' || review?.outcome === 'accepted-b';
  const selectedLabel = review?.outcome === 'accepted-a' ? 'Evidence A' : 'Evidence B';
  return (
    <div className={`issue74-conflict${selected ? ' conflict-reconciled' : ''}`}>
      <div className="issue74-conflict-heading"><EvidenceMarker state="contradictory" assertion={assertion} /><strong>{selected ? `${selectedLabel} selected for this preparation · source disagreement retained` : 'Conflicting molecular evidence · clinical review required'}</strong></div>
      <div className="issue74-conflict-values">
        {assertion.sources.map((source, index) => <div key={source.title}><span>Evidence {index === 0 ? 'A' : 'B'} · {source.hospital} · {source.date}</span><strong>{source.excerpt}</strong><small>{source.title}</small></div>)}
      </div>
      <p>{selected ? `A clinician selected ${selectedLabel} for this preparation. Both synthetic source records remain available and the disagreement is still visible; this does not alter either source.` : 'These synthetic source records disagree. Neither is ranked above the other, and neither is selected automatically.'}</p>
      <div className="issue74-fact-evidence">
        <EvidenceLink assertion={assertion} onInspect={onInspect} label="Compare both sources" />
        <EvidenceReviewControls assertion={assertion} />
      </div>
      {review && <p className={`issue74-review-receipt review-outcome-${review.outcome}`}>Human review saved · {review.outcome.replace('-', ' ')} · {review.reviewedAt.slice(0, 10)}{review.rationale && ` · ${review.rationale}`}</p>}
    </div>
  );
}

function EvidencePanel({ record, agentResult, horizon, onInspect }: { record: PatientRecord; agentResult?: AgentResult; horizon: Horizon; onInspect: (assertion: EvidenceAssertion) => void }) {
  const source = sourceFor(record.id);
  const evidenceGaps = evidencePanelMissingAssertions(record, horizon);
  const resectabilityAssertion = completenessItems(record, horizon).find((item) => item.label === 'Resectability')?.assertion ?? missingAssertion(record, 'Resectability');
  const missingCount = evidenceGaps.length + (record.id === 'P-010' ? 1 : 0);
  const facts = caseFacts(record);
  const evidenceFacts = [
    { label: 'Diagnosis and stage', value: `${record.diagnosis.primary} · ${record.diagnosis.stage}`, assertion: facts.disease },
    { label: 'Treatment', value: treatmentSummary(record), assertion: facts.treatments },
    { label: 'Latest imaging report', value: record.imaging?.at(-1)?.result ?? 'No imaging report found in this record.', assertion: facts.imaging ?? missingAssertion(record, 'Imaging report') },
  ];
  return (
    <>
      <Panel title="Evidence gathered" actions={<Pill tone="info">{source.format}</Pill>}>
        <dl className="issue74-evidence-facts"><dt>Source institution</dt><dd>{source.label}</dd>
          {evidenceFacts.map((fact) => <div className="issue74-evidence-fact-row" key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}<span className="issue74-fact-evidence"><EvidenceMarker state={fact.assertion.state} assertion={fact.assertion} /><EvidenceLink assertion={fact.assertion} onInspect={onInspect} /></span></dd></div>)}
        </dl>
        {record.id === 'P-010' && horizon === 'future' && <ItalianReport record={record} onInspect={onInspect} />}
      </Panel>
      <Panel title="Missing or unresolved" actions={<Pill tone={missingCount ? 'warn' : 'ok'}>{missingCount ? `${missingCount} open` : 'No gap recorded'}</Pill>}>
        {evidenceGaps.length ? <ul className="issue74-gaps">{evidenceGaps.map(({ label, assertion }) => <li key={label}><EvidenceMarker state="missing" assertion={assertion} /><span>{label}</span><EvidenceLink assertion={assertion} onInspect={onInspect} label="Review gap" /></li>)}</ul> : <p>No open questions are recorded in this synthetic file.</p>}
        {record.id === 'P-010' && <p><EvidenceMarker state="missing" assertion={resectabilityAssertion} /> Direct review of the MRI images. Resectability is not stated in the source report. <EvidenceLink assertion={resectabilityAssertion} onInspect={onInspect} label="Review gap" /></p>}
        {record.id === 'P-003' && <ConflictCard record={record} onInspect={onInspect} />}
      </Panel>
      {agentResult && (
        <Panel title="Assistant's source-grounded output" actions={<Pill tone={agentResult.mode === 'copilot' ? 'ok' : 'neutral'}>{agentResult.mode === 'copilot' ? 'Copilot SDK' : 'Demo mode'}</Pill>}>
          <p className="issue74-muted">Generated assertions are labelled below. An item without an attached source is marked unverified.</p>
          <AssistantEvidence record={record} result={agentResult} onInspect={onInspect} />
        </Panel>
      )}
    </>
  );
}

type CompletenessItem = {
  label: string;
  detail: string;
  state: 'present' | 'missing' | 'conflicting';
  relevance: string;
  assertion: EvidenceAssertion;
};

function completenessItems(record: PatientRecord, horizon: Horizon): CompletenessItem[] {
  const metastatic = /metast|stage iv/i.test(`${record.diagnosis.primary} ${record.diagnosis.stage}`);
  const markerNames = Object.keys(record.diagnosis.biomarkers);
  const molecularResult = Object.entries(record.diagnosis.biomarkers).map(([name, value]) => `${name}: ${value}`).join(' · ');
  const hasRasBraf = markerNames.some((name) => /ras|braf/i.test(name)) || /ras|braf/i.test(molecularResult);
  const facts = caseFacts(record);
  const items: CompletenessItem[] = [
    {
      label: 'Diagnosis and stage',
      detail: `${record.diagnosis.primary} · ${record.diagnosis.stage}`,
      state: 'present',
      relevance: 'Starting point for the recorded MDT question.',
      assertion: facts.stage,
    },
    {
      label: 'Treatment history',
      detail: record.treatments.map((item) => `${item.regimen} (${item.status})`).join(' · ') || 'No treatment entry in this record.',
      state: record.treatments.length ? 'present' : 'missing',
      relevance: 'Available context for the team; check dates and status against the source.',
      assertion: record.treatments.length ? facts.treatments : missingAssertion(record, 'Treatment history'),
    },
    {
      label: 'Latest imaging report',
      detail: record.imaging?.at(-1)?.result ?? (record.id === 'P-003' ? 'A surveillance CT is mentioned in the timeline, but its report is not in this record.' : 'No imaging report is present in this record.'),
      state: record.imaging?.length ? 'present' : 'missing',
      relevance: record.id === 'P-003' ? 'Could affect the open question about imaging timing.' : 'Review the report and images with the relevant specialist.',
      assertion: facts.imaging ?? missingAssertion(record, 'Latest imaging report'),
    },
  ];

  if (metastatic) {
    items.push({
      label: 'RAS / BRAF result',
      detail: hasRasBraf ? molecularResult : 'Not found in the patient record.',
      state: hasRasBraf ? 'present' : 'missing',
      relevance: 'May affect the pathway discussion; do not infer a result.',
      assertion: hasRasBraf
        ? evidenceFor(record, 'Biomarker', molecularResult)
        : missingAssertion(record, 'RAS / BRAF result'),
    });
  } else if (molecularResult) {
    const disagreement = record.id === 'P-003' && horizon === 'future';
    items.push({
      label: 'Molecular results',
      detail: disagreement ? 'Pathology addendum and outside referral list different KRAS results.' : molecularResult,
      state: disagreement ? 'conflicting' : 'present',
      relevance: disagreement ? 'Resolve the source disagreement before relying on either value.' : 'Recorded result is available for review.',
      assertion: disagreement ? conflictFor(record) : evidenceFor(record, 'Biomarker', molecularResult),
    });
  } else {
    items.push({
      label: 'Molecular results',
      detail: 'No result recorded in the patient file.',
      state: 'missing',
      relevance: 'Check whether a result is relevant to the MDT question.',
      assertion: missingAssertion(record, 'Molecular results'),
    });
  }

  if (record.id === 'P-010') {
    const reportSource: EvidenceSource = {
      title: 'MRI liver report · simulated Italian PDF',
      hospital: 'Ospedale Esempio, Italy · outside the shared data layer',
      date: record.imaging?.at(-1)?.date ?? record.diagnosis.date,
      type: 'Synthetic outside-hospital report · Italian',
      excerpt: '“Le lesioni epatiche note sono descritte; la resecabilità non è specificata nel referto.”',
    };
    items.push({
      label: 'Resectability',
      detail: horizon === 'future'
        ? 'Not stated in the located MRI report.'
        : 'Outside MRI report is unavailable in this horizon; no resectability value is in the minimal record.',
      state: 'missing',
      relevance: 'Directly relates to the recorded question about operability.',
      assertion: horizon === 'future'
        ? {
            patientId: record.id,
            statement: 'Resectability is not stated',
            state: 'missing',
            explanation: 'The simulated Italian MRI report was located, but it does not state whether the lesions are resectable. The answer remains open for clinical review.',
            sources: [reportSource],
          }
        : {
            patientId: record.id,
            statement: 'Resectability is not present in the minimal record',
            state: 'missing',
            explanation: 'The outside MRI PDF is unavailable in the six-month horizon. The minimal record does not provide a resectability value.',
            sources: [{
              title: 'Minimal dataset coverage check',
              hospital: 'Connected six-month working record',
              date: 'Current MDT preparation',
              type: 'Synthetic coverage assessment',
              excerpt: 'No resectability value is present in the minimal record. The outside MRI report is not available in this horizon.',
            }],
          },
    });
  }

  return items;
}

function evidencePanelMissingAssertions(record: PatientRecord, horizon: Horizon) {
  const completeness = completenessItems(record, horizon);
  const questions = record.open_questions.map((label) => ({ label, assertion: missingAssertion(record, label) }));
  const metastatic = /metast|stage iv/i.test(`${record.diagnosis.primary} ${record.diagnosis.stage}`);
  const hasRasBraf = Object.keys(record.diagnosis.biomarkers).some((name) => /ras|braf/i.test(name));
  const molecularGap = metastatic && !hasRasBraf;
  if (!molecularGap) return questions;
  const molecularItem = completeness.find((item) => item.label === 'RAS / BRAF result' && item.state === 'missing');
  return [...questions, {
    label: 'RAS result not found in this record.',
    assertion: molecularItem?.assertion ?? missingAssertion(record, 'RAS result not found in this record.'),
  }];
}

function missingEvidenceItems(record: PatientRecord, horizon: Horizon) {
  const completenessGaps = completenessItems(record, horizon)
    .filter((item) => item.state === 'missing')
    .map(({ label, assertion }) => ({ label, assertion }));
  const allGaps = [...completenessGaps, ...evidencePanelMissingAssertions(record, horizon)];
  return [...new Map(allGaps.map((item) => [reviewKey(item.assertion), item])).values()];
}

function cohortGuidance(record: PatientRecord) {
  if (record.id === 'P-003') {
    const pattern = 'In 12 of 16 illustrative synthetic post-resection colorectal cases with rising CEA, an interval imaging report was included in the timing discussion.';
    return {
      cohort: '16 synthetic post-resection cases with a rising CEA · simulated',
      pattern,
      question: 'Should the current surveillance imaging be reviewed or brought forward?',
      source: { title: 'Synthetic cohort pattern · surveillance', hospital: 'Illustrative European cohort workspace', date: 'Future horizon · simulated', type: 'Synthetic population-level summary · not patient evidence', excerpt: pattern },
    };
  }
  if (record.id === 'P-004') {
    const pattern = 'In 10 of 14 illustrative synthetic stage II case discussions, pathology risk details were explicitly reviewed alongside the MDT question.';
    return {
      cohort: '14 synthetic stage II colorectal case discussions · simulated',
      pattern,
      question: 'Are the pathology details relevant to this discussion available for the team to review?',
      source: { title: 'Synthetic cohort pattern · pathology context', hospital: 'Illustrative European cohort workspace', date: 'Future horizon · simulated', type: 'Synthetic population-level summary · not patient evidence', excerpt: pattern },
    };
  }
  if (record.id === 'P-005') {
    const pattern = 'In 15 of 20 illustrative synthetic colorectal cases on systemic treatment, a dated interval imaging report was linked to the response-review question.';
    return {
      cohort: '20 synthetic colorectal cases on systemic treatment · simulated',
      pattern,
      question: 'Which dated scan should the team use as the reference for this response review?',
      source: { title: 'Synthetic cohort pattern · response review', hospital: 'Illustrative European cohort workspace', date: 'Future horizon · simulated', type: 'Synthetic population-level summary · not patient evidence', excerpt: pattern },
    };
  }
  const pattern = 'In 11 of 18 illustrative synthetic metastatic colorectal cases, a RAS/BRAF result was documented before the pathway discussion; records without a result kept the testing question open.';
  return {
    cohort: '18 synthetic metastatic colorectal cases · simulated',
    pattern,
    question: 'Would obtaining a RAS/BRAF result help the team discuss this pathway?',
    source: { title: 'Synthetic cohort pattern · molecular evidence', hospital: 'Illustrative European cohort workspace', date: 'Future horizon · simulated', type: 'Synthetic population-level summary · not patient evidence', excerpt: pattern },
  };
}

function CompletenessPanel({
  record,
  horizon,
  recoveryState,
  selectedQuestion,
  onSearch,
  onSelectQuestion,
  onInspect,
}: {
  record: PatientRecord;
  horizon: Horizon;
  recoveryState: RecoveryState;
  selectedQuestion?: string;
  onSearch: () => void;
  onSelectQuestion: (question: string) => void;
  onInspect: (assertion: EvidenceAssertion) => void;
}) {
  const reviews = useContext(EvidenceReviewContext)?.reviews ?? {};
  const items = completenessItems(record, horizon);
  const reviewFor = (item: CompletenessItem) => reviews[reviewKey(item.assertion)];
  const isReconciled = (item: CompletenessItem) => {
    const outcome = reviewFor(item)?.outcome;
    return outcome === 'accepted-a' || outcome === 'accepted-b';
  };
  const unresolved = items.filter((item) => item.state !== 'present' && !isReconciled(item));
  const materialGaps = unresolved.filter((item) => item.relevance.startsWith('Could') || item.relevance.startsWith('May') || item.relevance.startsWith('Directly'));
  const cohort = cohortGuidance(record);
  const recoveryAssertion = record.id === 'P-003' && horizon === 'future'
    ? conflictFor(record)
    : record.id === 'P-010' && horizon === 'future'
      ? {
          patientId: record.id,
          statement: 'RAS / BRAF result and resectability remain unresolved',
          state: 'missing' as const,
          explanation: 'The simulated Italian MRI report was found but does not state resectability. No available source returned a RAS/BRAF result; neither missing patient value has been inferred.',
          sources: [
            ...(items.find((item) => item.label === 'Resectability')?.assertion.sources ?? []),
            {
              title: 'Search result · RAS / BRAF report not located',
              hospital: 'Available synthetic patient sources searched',
              date: 'Current MDT preparation',
              type: 'Simulated retrieval result',
              excerpt: 'No RAS/BRAF result was found in the available synthetic patient records. No patient result has been inferred.',
            },
          ],
        }
      : {
          patientId: record.id,
          statement: `Search for ${unresolved[0]?.label ?? 'additional evidence'}`,
          state: 'missing' as const,
          explanation: horizon === 'sixMonths'
            ? 'Only fields in the minimal tumour-board dataset were checked in this simulation; no additional patient value was found.'
            : 'The available synthetic patient record was checked; no additional source with this fact was returned.',
          sources: [{
            title: 'Synthetic record search · no additional result',
            hospital: sourceFor(record.id).label,
            date: 'Current MDT preparation',
            type: 'Simulated retrieval result',
            excerpt: `No additional source explicitly documents ${unresolved[0]?.label ?? 'the requested information'}. No patient value has been inferred.`,
          }],
        };
  const cohortAssertion: EvidenceAssertion = {
    patientId: record.id,
    statement: 'Illustrative population-level pattern · not a fact about this patient',
    state: 'single-source',
    explanation: 'This is a fabricated cohort signal for the demonstration, not patient evidence, a clinical recommendation or a treatment decision.',
    sources: [cohort.source],
  };

  return (
    <>
      <Panel title="Patient completeness · evidence needed for this MDT question" actions={<Pill tone={unresolved.length ? 'warn' : 'ok'}>{unresolved.length ? `${unresolved.length} evidence items remain open` : 'No open evidence gaps'}</Pill>}>
        <p className="issue74-intro">Current question: <strong>{clinicalQuestion(record)}</strong></p>
        <div className="issue74-completeness-summary">
          <strong>{materialGaps.length ? `${materialGaps.length} item${materialGaps.length === 1 ? '' : 's'} could materially affect this question` : 'No material gap flagged by this synthetic check'}</strong>
          <span>This is a checklist, not an overall confidence score. The MDT decides whether it has enough evidence to proceed.</span>
        </div>
        <ul className="issue74-completeness-list">
          {items.map((item) => {
            const review = reviewFor(item);
            const reconciled = isReconciled(item);
            const reviewRecorded = Boolean(review);
            return (
              <li key={item.label} className={`completeness-${reconciled ? 'reconciled' : reviewRecorded ? 'reviewed-open' : item.state}`}>
                <div className="issue74-completeness-item">
                  <span className="issue74-completeness-status">{item.state === 'present' ? '✓ PRESENT' : reconciled ? '✓ RECONCILED FOR THIS CASE' : reviewRecorded ? item.state === 'conflicting' ? 'REVIEW RECORDED · STILL CONFLICTING' : 'REVIEWED · STILL MISSING' : item.state === 'conflicting' ? '! CONFLICTING' : '– MISSING'}</span>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  <small>{reconciled ? `Evidence ${review?.outcome === 'accepted-a' ? 'A' : 'B'} selected for this preparation. Original source values remain unchanged.` : reviewRecorded ? `${reviewStatusLabel(review)}. The underlying evidence status is unchanged.` : item.relevance}</small>
                </div>
                <span className="issue74-fact-evidence"><EvidenceMarker state={item.assertion.state} assertion={item.assertion} /><EvidenceLink assertion={item.assertion} onInspect={onInspect} /></span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Recover · search available patient records" actions={<Pill tone={horizon === 'future' ? 'info' : 'neutral'}>{horizon === 'future' ? 'Simulated distributed-source search' : 'Minimal dataset only'}</Pill>}>
        <p className="issue74-intro">{horizon === 'future'
          ? 'Check the connected synthetic record and, where available, the simulated outside-hospital report before treating a gap as unavailable.'
          : 'Check only the fields already present in this patient’s minimal tumour-board record. Live cross-hospital queries and outside PDFs are not in this horizon.'}</p>
        <button className="hx-btn primary" type="button" disabled={recoveryState === 'searching'} onClick={onSearch}>
          {recoveryState === 'searching' ? <><span className="hx-spinner" aria-hidden /> Searching records…</> : recoveryState === 'complete' ? 'Search again' : 'Search for missing evidence'}
        </button>
        {recoveryState === 'searching' && (
          <Backstage
            title="Searching this synthetic patient’s available records"
            stages={[
              { label: 'Checking the patient record', detail: 'Matching the open requirement to recorded fields', ms: 600 },
              { label: 'Checking available reports', detail: horizon === 'future' ? 'Connected source and eligible outside report' : 'Minimal tumour-board fields only', ms: 800 },
              { label: 'Keeping any unresolved value open', detail: 'No population pattern is used to fill a patient fact', ms: 700 },
            ]}
            running
            note="Simulated retrieval only · no hospital was contacted."
          />
        )}
        {recoveryState === 'complete' && (
          <div className={`issue74-recovery-result${recoveryAssertion.state === 'contradictory' ? ' recovery-conflict' : ''}`}>
            <span className="issue74-eyebrow">SEARCH RESULT · {horizon === 'future' ? 'SYNTHETIC AVAILABLE SOURCES' : 'MINIMAL DATASET'}</span>
            {record.id === 'P-003' && horizon === 'future' ? (
              <>
                <strong>Two molecular sources found; they disagree.</strong>
                <p>The pathology addendum and referral letter contain different KRAS results. Neither is selected; a clinician must reconcile them.</p>
              </>
            ) : record.id === 'P-010' && horizon === 'future' ? (
              <>
                <strong>Italian MRI report located; RAS/BRAF and resectability remain unresolved.</strong>
                <p>The report does not answer the operability question, and no molecular result was found. Neither patient value has been inferred.</p>
              </>
            ) : (
              <>
                <strong>{unresolved.length ? 'No additional source with the missing fact was found.' : 'The available record fields were checked.'}</strong>
                <p>{horizon === 'sixMonths' ? 'This simulation searched only the minimal tumour-board fields; distributed sources are not queried in six months.' : 'No new patient-specific evidence was returned. The open item stays open for the MDT.'}</p>
              </>
            )}
            <EvidenceLink assertion={recoveryAssertion} onInspect={onInspect} label={recoveryAssertion.state === 'contradictory' ? 'Compare retrieved sources ↗' : 'Inspect search evidence ↗'} />
          </div>
        )}
      </Panel>

      <Panel title="Learn · what similar synthetic cases suggest asking next" actions={<Pill tone={horizon === 'future' ? 'info' : 'neutral'}>{horizon === 'future' ? 'Illustrative European cohort signal' : 'Future capability'}</Pill>}>
        {horizon === 'sixMonths' ? (
          <div className="issue74-future-only"><strong>Not available in six months</strong><span>Cross-hospital cohort learning is outside the minimal tumour-board dataset. No population-derived signal is shown as patient evidence.</span></div>
        ) : recoveryState !== 'complete' ? (
          <div className="issue74-future-only"><strong>Search patient records before comparing with similar cases</strong><span>First check whether the missing evidence is already available. Population patterns will only suggest a next question; they cannot replace a patient result.</span></div>
        ) : (
          <>
            <p className="issue74-intro">This separate, simulated population view suggests what might help distinguish the next question. It never fills in this patient’s missing data.</p>
            <div className="issue74-cohort-signal">
              <span className="issue74-eyebrow">SYNTHETIC POPULATION PATTERN · NOT PATIENT EVIDENCE</span>
              <strong>{cohort.cohort}</strong>
              <p>{cohort.pattern}</p>
              <EvidenceLink assertion={cohortAssertion} onInspect={onInspect} label="Inspect cohort signal and source" />
            </div>
            <div className="issue74-next-question">
              <div><span className="issue74-eyebrow">POSSIBLE NEXT QUESTION FOR THE MDT</span><strong>{cohort.question}</strong></div>
              <button className="hx-btn" type="button" onClick={() => onSelectQuestion(cohort.question)}>
                {selectedQuestion === cohort.question ? 'Added to discussion questions' : 'Add as a discussion question'}
              </button>
            </div>
            <p className="issue74-muted">The cohort pattern is fabricated for this prototype, not a clinical recommendation. The MDT decides whether to investigate, order a test or take any other action.</p>
            {selectedQuestion && <div className="issue74-notice" role="status">Discussion question noted: {selectedQuestion} No test was ordered and no patient fact was changed.</div>}
          </>
        )}
      </Panel>
    </>
  );
}

function CoveragePanel({ groups, record }: { groups: { group: string; elements: { name: string; likely_source: string }[] }[]; record?: PatientRecord }) {
  const allElements = groups.flatMap((group) => group.elements.map((element) => ({ ...element, group: group.group })));
  const neededNames = [
    'Date of tumour diagnosis',
    'Systemic therapy regimen',
    'Imaging result (e.g. CT thorax-abdomen)',
    'mCRC: RAS',
  ];
  const items = neededNames.map((name) => {
    const element = allElements.find((item) => item.name === name);
    let found = false;
    if (record && name === 'Date of tumour diagnosis') found = Boolean(record.diagnosis.date);
    if (record && name === 'Systemic therapy regimen') found = record.treatments.length > 0;
    if (record && name === 'Imaging result (e.g. CT thorax-abdomen)') found = Boolean(record.imaging?.length);
    if (record && name === 'mCRC: RAS') found = Object.keys(record.diagnosis.biomarkers).some((key) => /^(k?ras)$/i.test(key));
    return { name, group: element?.group ?? 'Minimal tumour-board dataset', likely_source: element?.likely_source ?? 'report text', state: found ? 'Available in record' : 'Not found in this record' };
  });
  const available = items.filter((item) => item.state === 'Available in record').length;
  return (
    <Panel title="In six months · what the minimal dataset can do" actions={<Pill tone="info">Simulated from the UMC Utrecht working list</Pill>}>
      <p className="issue74-intro">{groups.length ? `${available} of ${items.length} relevant fields are present in this synthetic record.` : 'Loading the minimal tumour-board dataset…'} The usual source is an assumption to check with each hospital.</p>
      <ul className="issue74-coverage">{items.map((item) => <li key={item.name}><span>{item.state === 'Available in record' ? '✓' : '—'}</span><strong>{item.name}</strong><small>{item.group} · usually {item.likely_source}</small></li>)}</ul>
      <div className="issue74-future-only"><strong>Needs the future platform</strong><span>Retrieving the Italian PDF from a hospital outside the shared layer, full image review and tailored specialty views.</span></div>
      <p className="issue74-muted">Each hospital would deliver the listed structured fields, start structuring report text and record MDT questions in a fixed form. Images are not part of the minimal dataset.</p>
    </Panel>
  );
}
