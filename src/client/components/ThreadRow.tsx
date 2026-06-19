import type { AddressThread } from "../../shared/types";

export function ThreadRow({ thread }: { thread: AddressThread }) {
  return (
    <li className={thread.yourTurn ? "thread your-turn" : "thread"}>
      <a href={thread.url} target="_blank" rel="noreferrer">
        {thread.path}
        {thread.line != null ? `:${thread.line}` : ""}
      </a>
      <span className="who"> @{thread.author}</span>
      {thread.isOutdated && <span className="badge">outdated</span>}
      <p className="snippet">{thread.snippet}</p>
    </li>
  );
}
