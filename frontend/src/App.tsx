import { useEffect, useRef, useState } from 'react';

type Tab = 'summary' | 'decision' | 'listen';
type Status = 'draft' | 'approved';
type Fact = { id: string; label: string; value: string; source: string };
type PatientCase = {
  id: string; synthetic: boolean; patient_name: string; age: number; diagnosis: string;
  decision_question: string; facts: Fact[]; contact: string;
};
type Action = { action: string; owner: string; due: string };
type Decision = {
  outcomes: string[]; rationale: string; disagreements: string; unresolved_questions: string;
  missing_evidence: string; actions: Action[]; status: Status; override_missing: boolean;
  approved_by: string | null;
};
type Voice = { role: string; name: string; persona: string; voice_id: string; provider: string };
type TranscriptTurn = {
  id: number; role: string; name: string; kind: 'agent' | 'chair' | 'human' | 'transcription';
  text: string; evidence?: string; timestamp: string;
};
type Documents = {
  patient_summary: string; medical_record_note: string; referrer_letter: string;
  provenance: { statement: string; source_id: string; source: string }[]; draft: boolean;
};

const outcomes = ['Continue treatment', 'Change treatment', 'Request diagnostics', 'Refer to surgery', 'Screen for a trial', 'Defer'];
const fallbackCase: PatientCase = {
  id: 'SYN-MDO-024', synthetic: true, patient_name: 'Alex Morgan', age: 57,
  diagnosis: 'Stage IIIA non-small cell lung cancer (adenocarcinoma)',
  decision_question: 'What is the safest next treatment after initial chemotherapy and radiotherapy?',
  facts: [
    { id: 'path-1', label: 'Pathology', value: 'Adenocarcinoma; PD-L1 tumour proportion score 60%.', source: 'Synthetic pathology report · 18 Sep 2026' },
    { id: 'img-1', label: 'Imaging', value: 'CT shows partial response and no new distant disease.', source: 'Synthetic CT report · 20 Sep 2026' },
    { id: 'lab-1', label: 'Relevant test', value: 'EGFR, ALK and ROS1 driver alterations were not detected.', source: 'Synthetic molecular report · 19 Sep 2026' },
  ],
  contact: 'Thoracic oncology specialist nurse via the hospital oncology number',
};
const fallbackDecision: Decision = {
  outcomes: ['Continue treatment', 'Request diagnostics'],
  rationale: 'The board recommends discussing consolidation immunotherapy because imaging shows a partial response, no distant progression is reported, and no targetable driver alteration is documented.',
  disagreements: 'No disagreement on the proposed next step.',
  unresolved_questions: 'Confirm current performance status and screen for treatment contraindications.',
  missing_evidence: 'Current pulmonary function and performance-status assessment.',
  actions: [
    { action: 'Arrange oncology review and contraindication screen', owner: 'Medical oncologist', due: 'Within 7 days' },
    { action: 'Confirm pulmonary function results', owner: 'Specialist nurse', due: 'Before oncology review' },
  ],
  status: 'approved', override_missing: false, approved_by: 'Dr Sam Taylor (synthetic)',
};
const fallbackVoices: Voice[] = [
  ['chair', 'MDO chair'], ['oncologist', 'Medical oncologist'], ['radiologist', 'Radiologist'],
  ['pathologist', 'Pathologist'], ['surgeon', 'Surgeon'], ['radiation_oncologist', 'Radiation oncologist'],
  ['nurse', 'Specialist nurse'], ['trials', 'Clinical-trial specialist'],
].map(([role, name]) => ({ role, name, persona: `${name}: concise, evidence-grounded and collaborative`, voice_id: '', provider: 'Browser fallback' }));

function time() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function discussion(patient: PatientCase, detailed: boolean): TranscriptTurn[] {
  const fact = (id: string) => patient.facts.find((item) => item.id === id);
  const turns: Omit<TranscriptTurn, 'id' | 'timestamp'>[] = [
    { role: 'chair', name: 'MDO chair', kind: 'chair', text: `Welcome. We are reviewing synthetic case ${patient.id}. Our question is: ${patient.decision_question}`, evidence: patient.diagnosis },
    { role: 'radiologist', name: 'Radiologist', kind: 'agent', text: fact('img-1')?.value || 'No imaging conclusion is available.', evidence: fact('img-1')?.source },
    { role: 'pathologist', name: 'Pathologist', kind: 'agent', text: `${fact('path-1')?.value || ''} ${fact('lab-1')?.value || ''}`.trim(), evidence: `${fact('path-1')?.source || ''}; ${fact('lab-1')?.source || ''}` },
    { role: 'oncologist', name: 'Medical oncologist', kind: 'agent', text: 'The recorded response makes consolidation therapy worth discussing, subject to performance status and contraindication review.', evidence: 'Board interpretation; not a finalized decision' },
  ];
  if (detailed) {
    turns.push(
      { role: 'radiation_oncologist', name: 'Radiation oncologist', kind: 'agent', text: 'Treatment completion and toxicity must be confirmed before the board records its recommendation.', evidence: fact('note-1')?.source || 'Clinical context is incomplete' },
      { role: 'nurse', name: 'Specialist nurse', kind: 'agent', text: 'The patient needs a plain-language review and a named contact while the missing assessments are arranged.', evidence: patient.contact },
      { role: 'trials', name: 'Clinical-trial specialist', kind: 'agent', text: 'Trial screening may be revisited if standard consolidation is unsuitable; eligibility has not been established.', evidence: 'No trial eligibility source in this case' },
    );
  }
  turns.push({ role: 'chair', name: 'MDO chair', kind: 'chair', text: 'There is agreement to record a proposed next step, while performance status, pulmonary function and contraindications remain unresolved. A clinician must capture and approve the actual decision.', evidence: 'Chair summary of discussion; approval still required' });
  return turns.map((turn, id) => ({ ...turn, id, timestamp: time() }));
}

export default function App() {
  const [tab, setTab] = useState<Tab>('decision');
  const [patient, setPatient] = useState(fallbackCase);
  const [decision, setDecision] = useState(fallbackDecision);
  const [voices, setVoices] = useState(fallbackVoices);
  const [documents, setDocuments] = useState<Documents | null>(null);
  const [notice, setNotice] = useState('Synthetic demo loaded. Capture the human board decision before generating communications.');
  const [literacy, setLiteracy] = useState('standard');
  const [language, setLanguage] = useState('English');
  const [accessibility, setAccessibility] = useState('None');
  const [summary, setSummary] = useState('');
  const [approvedSummary, setApprovedSummary] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [turns, setTurns] = useState<TranscriptTurn[]>(() => discussion(fallbackCase, false));
  const [turnIndex, setTurnIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState('');
  const [draftSpeech, setDraftSpeech] = useState('');
  const [confirmSpeech, setConfirmSpeech] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState('chair');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/mdo/demo').then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        setPatient(data.case); setDecision(data.decision); setVoices(data.voices);
        setTurns(discussion(data.case, false));
      }).catch(() => setNotice('Backend unavailable. Using local synthetic demo data; saving and generation are disabled.'));
  }, []);

  useEffect(() => {
    if (!playing || muted || turnIndex >= turns.length) return;
    const turn = turns[turnIndex];
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      setTurnIndex((index) => index + 1);
      if (turnIndex + 1 >= turns.length) setPlaying(false);
    };
    fetch('/api/mdo/voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: turn.role, text: turn.text }),
    }).then(async (response) => {
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url); audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); finish(); };
      await audio.play();
    }).catch(() => {
      if (!('speechSynthesis' in window)) { setNotice('No speech provider is available. Captions remain available.'); finish(); return; }
      const utterance = new SpeechSynthesisUtterance(turn.text);
      utterance.onend = finish;
      window.speechSynthesis.speak(utterance);
      setNotice('ElevenLabs unavailable; using disclosed browser speech synthesis fallback.');
    });
    return () => { cancelled = true; audioRef.current?.pause(); window.speechSynthesis?.cancel(); };
  }, [playing, muted, turnIndex, turns]);

  const updateDecision = <K extends keyof Decision>(key: K, value: Decision[K]) =>
    setDecision((current) => ({ ...current, [key]: value, status: key === 'status' ? value as Status : 'draft', approved_by: key === 'status' ? current.approved_by : null }));

  const saveDecision = async (approve: boolean) => {
    const next = { ...decision, status: approve ? 'approved' as const : 'draft' };
    if (approve && !next.approved_by) { setNotice('Enter the approving clinician before approval.'); return; }
    try {
      const response = await fetch('/api/mdo/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const data = await response.json();
      if (!response.ok) { setNotice(`${data.detail?.message || 'Approval blocked'} Missing: ${(data.detail?.missing || []).join(', ')}`); return; }
      setDecision(next); setNotice(approve ? 'Human board decision approved and audit event recorded.' : 'Decision saved as draft.');
      if (approve) await generate(next);
    } catch { setNotice('Could not save: backend unavailable.'); }
  };

  const generate = async (approvedDecision = decision) => {
    try {
      const response = await fetch('/api/mdo/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case: patient, decision: approvedDecision, preferences: { literacy, language, age_appropriate: true, accessibility, read_aloud: false } }),
      });
      const data = await response.json();
      if (!response.ok) { setNotice(typeof data.detail === 'string' ? data.detail : 'Generation blocked.'); return; }
      setDocuments(data); setSummary(data.patient_summary); setApprovedSummary(false);
      setNotice('Draft communications generated from cited case facts and the approved human decision.');
    } catch { setNotice('Could not generate communications: backend unavailable.'); }
  };

  const stopAudio = () => {
    setPlaying(false); audioRef.current?.pause(); window.speechSynthesis?.cancel();
  };
  const startMic = () => {
    stopAudio();
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setMicError('Live transcription is unavailable in this browser. Type the contribution instead.'); return; }
    const recognition = new Recognition();
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = language === 'German' ? 'de-DE' : 'en-GB';
    recognition.onresult = (event: any) => setDraftSpeech(Array.from(event.results).map((result: any) => result[0].transcript).join(''));
    recognition.onerror = (event: any) => { setMicError(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Transcription failed: ${event.error}`); setRecording(false); };
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition; setMicError(''); setRecording(true); recognition.start();
  };
  const stopMic = () => { recognitionRef.current?.stop(); setRecording(false); };
  const submitSpeech = () => {
    if (!draftSpeech.trim()) { setMicError('No speech was detected. Record again or type a contribution.'); return; }
    const human: TranscriptTurn = { id: Date.now(), role: 'human', name: 'Clinician', kind: confirmSpeech ? 'transcription' : 'human', text: draftSpeech.trim(), timestamp: time() };
    const routed: TranscriptTurn = { id: Date.now() + 1, role: 'chair', name: 'MDO chair', kind: 'chair', text: `Thank you. I have recorded that contribution and will route it to ${selectedAgent === 'chair' ? 'the relevant specialists' : voices.find((voice) => voice.role === selectedAgent)?.name}. It is discussion context, not an approved decision.`, timestamp: time(), evidence: 'Chair routing; human approval required' };
    setTurns((current) => [...current, human, routed]); setDraftSpeech(''); setTurnIndex(turns.length); setPlaying(true);
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setNotice('Copied to clipboard.');
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-block"><span className="eyebrow">Health Rewired</span><h1>Oncology MDO</h1></div>
        <div className="header-meta"><span className="demo-badge">Synthetic demo data</span><span>Case {patient.id}</span></div>
      </header>

      <section className="case-banner">
        <div><span className="eyebrow soft">Decision question</span><h2>{patient.decision_question}</h2><p>{patient.patient_name}, {patient.age} · {patient.diagnosis}</p></div>
        <div className={`approval-state ${decision.status}`}>{decision.status === 'approved' ? '✓ Clinician-approved decision' : 'Draft decision'}</div>
      </section>

      <div className="notice" role="status" aria-live="polite">{notice}</div>
      <nav className="tabs" aria-label="MDO workspace">
        {([['summary', 'Patient summary'], ['decision', 'Decision & letter'], ['listen', 'Listen to the MDO']] as [Tab, string][]).map(([id, label]) =>
          <button key={id} className={tab === id ? 'active' : ''} aria-selected={tab === id} role="tab" onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'summary' && <main className="workspace two-column">
        <aside className="panel settings-panel">
          <h3>Communication settings</h3>
          <label>Health-literacy level<select value={literacy} onChange={(event) => setLiteracy(event.target.value)}><option value="simple">Simple</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></label>
          <label>Preferred language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>German</option><option>French</option><option>Spanish</option></select></label>
          <label>Accessibility needs<input value={accessibility} onChange={(event) => setAccessibility(event.target.value)} /></label>
          <p className="help">Age-appropriate communication is enabled for age {patient.age}. Language preferences are recorded; clinician review remains required.</p>
          <button className="primary-button" onClick={() => generate()} disabled={decision.status !== 'approved'}>{summary ? 'Regenerate draft' : 'Generate from approved decision'}</button>
          <button className="secondary-button" onClick={() => {
            if (!summary) return;
            stopAudio(); const utterance = new SpeechSynthesisUtterance(summary); window.speechSynthesis?.speak(utterance);
          }} disabled={!summary}>Read aloud</button>
        </aside>
        <section className="panel document-panel">
          <div className="panel-title"><div><span className="widget-tag">Draft · clinician review required</span><h3>Patient-facing summary</h3></div>{approvedSummary && <span className="approved-mark">Approved communication</span>}</div>
          {summary ? <textarea className="document-editor" aria-label="Editable patient summary" value={summary} onChange={(event) => { setSummary(event.target.value); setApprovedSummary(false); }} /> : <div className="empty-state">Approve the board decision, then generate a grounded patient summary.</div>}
          <div className="button-row"><button onClick={() => copy(summary)} disabled={!summary}>Copy</button><button onClick={() => setApprovedSummary(true)} disabled={!summary}>Approve summary</button></div>
          {documents && <details><summary>Statement provenance</summary>{documents.provenance.map((item) => <p key={item.source_id}><strong>{item.source_id}</strong> — {item.source}</p>)}</details>}
        </section>
      </main>}

      {tab === 'decision' && <main className="workspace">
        <section className="panel decision-panel">
          <div className="panel-title"><div><span className="widget-tag">Human board decision</span><h3>Capture the actual MDO decision</h3></div><span className="ai-label">Not an AI evidence summary</span></div>
          <fieldset><legend>Outcomes (select one or more)</legend><div className="option-grid">{outcomes.map((outcome) => <label className="check-option" key={outcome}><input type="checkbox" checked={decision.outcomes.includes(outcome)} onChange={() => updateDecision('outcomes', decision.outcomes.includes(outcome) ? decision.outcomes.filter((item) => item !== outcome) : [...decision.outcomes, outcome])} />{outcome}</label>)}</div></fieldset>
          <div className="form-grid">
            <label className="span-two">Rationale discussed<textarea value={decision.rationale} onChange={(event) => updateDecision('rationale', event.target.value)} /></label>
            <label>Disagreements<textarea value={decision.disagreements} onChange={(event) => updateDecision('disagreements', event.target.value)} /></label>
            <label>Unresolved questions<textarea value={decision.unresolved_questions} onChange={(event) => updateDecision('unresolved_questions', event.target.value)} /></label>
            <label className="span-two">Missing evidence<textarea value={decision.missing_evidence} onChange={(event) => updateDecision('missing_evidence', event.target.value)} /></label>
          </div>
          <h4>Owners and next steps</h4>
          {decision.actions.map((action, index) => <div className="action-row" key={index}>
            <input aria-label={`Action ${index + 1}`} value={action.action} onChange={(event) => updateDecision('actions', decision.actions.map((item, position) => position === index ? { ...item, action: event.target.value } : item))} />
            <input aria-label={`Owner ${index + 1}`} value={action.owner} onChange={(event) => updateDecision('actions', decision.actions.map((item, position) => position === index ? { ...item, owner: event.target.value } : item))} />
            <input aria-label={`Due ${index + 1}`} value={action.due} onChange={(event) => updateDecision('actions', decision.actions.map((item, position) => position === index ? { ...item, due: event.target.value } : item))} />
          </div>)}
          <button className="text-button" onClick={() => updateDecision('actions', [...decision.actions, { action: '', owner: '', due: '' }])}>+ Add next step</button>
          <div className="approval-box">
            <label>Approving clinician<input value={decision.approved_by || ''} onChange={(event) => setDecision((current) => ({ ...current, approved_by: event.target.value || null }))} placeholder="Required for approval" /></label>
            <label className="override"><input type="checkbox" checked={decision.override_missing} onChange={(event) => setDecision((current) => ({ ...current, override_missing: event.target.checked }))} />Explicitly override missing required information</label>
            <div className="button-row"><button onClick={() => saveDecision(false)}>Save draft</button><button className="primary-button" onClick={() => saveDecision(true)}>Approve decision & generate</button></div>
          </div>
        </section>
        {documents && <section className="generated-grid">
          <Document title="Medical-record note" text={documents.medical_record_note} copy={copy} />
          <Document title="GP / referrer letter" text={documents.referrer_letter} copy={copy} />
        </section>}
      </main>}

      {tab === 'listen' && <main className="workspace mdo-layout">
        <section className="panel meeting-panel">
          <div className="meeting-toolbar">
            <div><span className="widget-tag">Human approval checkpoint</span><h3>Spoken multidisciplinary meeting</h3></div>
            <label className="mode-toggle">Mode<select value={detailed ? 'detailed' : 'concise'} onChange={(event) => { const next = event.target.value === 'detailed'; setDetailed(next); setTurns(discussion(patient, next)); setTurnIndex(0); stopAudio(); }}><option value="concise">Concise demo</option><option value="detailed">Detailed discussion</option></select></label>
          </div>
          <div className="playback" aria-label="Meeting playback controls">
            <button onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => { stopAudio(); setTurnIndex(0); }}>Replay</button>
            <button onClick={stopAudio}>Stop</button>
            <button onClick={() => setMuted((value) => !value)}>{muted ? 'Unmute' : 'Mute'}</button>
            <button onClick={() => setTurnIndex((index) => Math.min(index + 1, turns.length - 1))}>Skip speaker</button>
            <button onClick={() => setTurnIndex(Math.max(0, turns.length - 1))}>Final summary</button>
          </div>
          <div className="speaker-stage">
            <div className="speaker-avatar">{turns[turnIndex]?.name.charAt(0) || '✓'}</div>
            <div><span>Now speaking</span><h4>{turns[turnIndex]?.name || 'Approval checkpoint'}</h4><p>{turns[turnIndex]?.evidence || 'No active evidence reference'}</p></div>
          </div>
          <div className="transcript" aria-live="polite">
            {turns.map((turn, index) => <article key={turn.id} className={`transcript-turn ${index === turnIndex ? 'active' : ''} ${turn.kind}`}>
              <div><strong>{turn.name}</strong><span>{turn.timestamp} · {turn.kind === 'transcription' ? 'speech-to-text (editable before submission)' : turn.kind}</span></div><p>{turn.text}</p>{turn.evidence && <small>Evidence: {turn.evidence}</small>}
            </article>)}
          </div>
        </section>
        <aside className="side-stack">
          <section className="panel join-panel">
            <h3>Join discussion</h3><p>Speaking pauses agent audio. Contributions enter the transcript but never become the final decision.</p>
            <label>Address<select value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)}>{voices.map((voice) => <option value={voice.role} key={voice.role}>{voice.name}</option>)}</select></label>
            <button className={`mic-button ${recording ? 'recording' : ''}`} onMouseDown={startMic} onMouseUp={stopMic} onTouchStart={startMic} onTouchEnd={stopMic} aria-pressed={recording}>{recording ? '● Listening — release to stop' : '🎙 Hold to talk'}</button>
            <label>Transcript<textarea value={draftSpeech} onChange={(event) => setDraftSpeech(event.target.value)} placeholder="Speech transcription appears here and can be corrected." /></label>
            <label className="override"><input type="checkbox" checked={confirmSpeech} onChange={(event) => setConfirmSpeech(event.target.checked)} />Confirm or correct transcript before submitting</label>
            {micError && <p className="error" role="alert">{micError}</p>}
            <button className="primary-button" onClick={submitSpeech}>Add contribution</button>
            <button onClick={() => { recording ? stopMic() : startMic(); }}>{recording ? 'Mute microphone' : 'Unmute microphone'}</button>
          </section>
          <section className="panel voice-panel">
            <h3>Specialist voices</h3><p className="help">External ElevenLabs processing is configurable. Only caption text is sent; API keys stay server-side. Browser speech is used when unavailable.</p>
            {voices.map((voice) => <div className="voice-row" key={voice.role}><div><strong>{voice.name}</strong><span>{voice.provider}</span></div><button onClick={() => { setTurns([{ id: Date.now(), role: voice.role, name: voice.name, kind: voice.role === 'chair' ? 'chair' : 'agent', text: voice.persona, timestamp: time() }]); setTurnIndex(0); setPlaying(true); }}>Preview</button></div>)}
          </section>
          <button className="approval-checkpoint" onClick={() => setTab('decision')}>Discussion complete → Capture human decision</button>
        </aside>
      </main>}
    </div>
  );
}

function Document({ title, text, copy }: { title: string; text: string; copy: (text: string) => void }) {
  return <article className="panel document-card"><span className="widget-tag">AI-formatted · human decision</span><h3>{title}</h3><pre>{text}</pre><button onClick={() => copy(text)}>Copy draft</button></article>;
}
