import type { BlockProps } from './registry';

export function AlertBlock({ block }: BlockProps) {
  return (
    <div className="block-body" role="alert">
      {block.body && <p className="prose">{block.body}</p>}
      <ul className="alerts">
        {block.items.map((item, index) => (
          <li key={index} data-severity={item.severity ?? block.severity ?? 'warning'}>
            <strong>{item.label}</strong>
            {item.detail && <span> – {item.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
