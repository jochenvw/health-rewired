import type { BlockProps } from './registry';

export function SummaryBlock({ block }: BlockProps) {
  return (
    <div className="block-body">
      {block.body && <p className="prose">{block.body}</p>}
      {block.items.length > 0 && (
        <ul className="plain-list">
          {block.items.map((item, index) => (
            <li key={index}>
              <strong>{item.label}</strong>
              {item.detail && <span> – {item.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
