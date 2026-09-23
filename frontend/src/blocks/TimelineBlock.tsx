import type { BlockProps } from './registry';

export function TimelineBlock({ block }: BlockProps) {
  const items = [...block.items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  return (
    <div className="block-body">
      <ol className="timeline">
        {items.map((item, index) => (
          <li key={index} data-severity={item.severity ?? undefined}>
            <time>{item.date}</time>
            <div>
              <strong>{item.label}</strong>
              {item.detail && <p>{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
