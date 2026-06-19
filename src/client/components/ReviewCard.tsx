import type { ReviewItem } from "../../shared/types";

export function ReviewCard({
  item,
  onSnooze,
}: {
  item: ReviewItem;
  onSnooze: (key: string) => void;
}) {
  return (
    <article className="card">
      <header>
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.repo}#{item.number}
        </a>
        <span className="age">{item.ageDays}d</span>
        <button onClick={() => onSnooze(item.key)}>Snooze 1d</button>
      </header>
      <p className="title">{item.title}</p>
      <p className="meta">
        by {item.author}
        {item.labels.map((l) => (
          <span key={l} className="badge">
            {l}
          </span>
        ))}
      </p>
    </article>
  );
}
