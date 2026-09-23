import type { BlockProps } from './registry';

export function EvidenceBlock({ block }: BlockProps) {
  return (
    <div className="block-body">
      {block.body && <p className="prose">{block.body}</p>}
      <ul className="evidence">
        {block.items.map((item, index) => (
          <li key={index}>
            <strong>{item.label}</strong>
            {item.detail && <p>{item.detail}</p>}
            {item.source && <span className="source">Source: {item.source}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
