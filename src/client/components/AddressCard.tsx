import type { AddressItem } from "../../shared/types";
import { ThreadRow } from "./ThreadRow";

export function AddressCard({
  item,
  onSnooze,
}: {
  item: AddressItem;
  onSnooze: (key: string) => void;
}) {
  return (
    <article className="card">
      <header>
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.repo}#{item.number}
        </a>
        {item.reviewDecision === "CHANGES_REQUESTED" && (
          <span className="badge danger">changes requested</span>
        )}
        <span className="count">
          {item.yourTurnCount}/{item.unresolvedCount} your turn
        </span>
        <button onClick={() => onSnooze(item.key)}>Snooze 1d</button>
      </header>
      <p className="title">{item.title}</p>
      <ul className="threads">
        {item.threads.map((t) => (
          <ThreadRow key={t.id} thread={t} />
        ))}
      </ul>
    </article>
  );
}
