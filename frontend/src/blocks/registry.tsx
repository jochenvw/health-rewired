import type { ComponentType } from 'react';
import type { UIBlock } from '../api';
import { ActionsBlock } from './ActionsBlock';
import { AlertBlock } from './AlertBlock';
import { EvidenceBlock } from './EvidenceBlock';
import { OutcomeRiskBlock } from './OutcomeRiskBlock';
import { PatientCardBlock } from './PatientCardBlock';
import { SummaryBlock } from './SummaryBlock';
import { TimelineBlock } from './TimelineBlock';

export type BlockProps = { block: UIBlock };

/**
 * Generative UI registry: the agent chooses block `type`s (backend/app/agent/ui.py),
 * this map decides how each one is drawn. Add a type here and in ui.py.
 */
const registry: Record<string, ComponentType<BlockProps>> = {
  summary: SummaryBlock,
  patient_card: PatientCardBlock,
  timeline: TimelineBlock,
  evidence: EvidenceBlock,
  alert: AlertBlock,
  actions: ActionsBlock,
  outcome_risk: OutcomeRiskBlock,
};

export function RenderBlock({ block }: BlockProps) {
  const Component = registry[block.type] ?? SummaryBlock;
  return (
    <article className={`block block-${block.type}`} data-severity={block.severity ?? undefined}>
      <header className="block-header">
        <span className="block-kind">{block.type.replace('_', ' ')}</span>
        <h4>{block.title}</h4>
      </header>
      <Component block={block} />
    </article>
  );
}
