import { useCallback, useEffect, useState } from "react";
import type { ItemsResponse } from "../shared/types";
import { getItems, snooze } from "./api";
import { ReviewCard } from "./components/ReviewCard";
import { AddressCard } from "./components/AddressCard";

const POLL_MS = 5 * 60 * 1000;
const isActive = (until: string | null) =>
  until != null && new Date(until).getTime() > Date.now();

export function App() {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);

  const refresh = useCallback(async () => {
    setData(await getItems());
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const onSnooze = useCallback(
    async (key: string) => {
      const until = new Date(Date.now() + 86_400_000).toISOString();
      await snooze(key, until);
      await refresh();
    },
    [refresh],
  );

  if (!data) return <p>Loading…</p>;
  if (data.error === "no_token") {
    return (
      <main>
        <h1>GitHub Monitor</h1>
        <p>
          No GitHub token found. Run <code>gh auth login</code> or set{" "}
          <code>GITHUB_TOKEN</code>, then refresh.
        </p>
      </main>
    );
  }

  const review = data.toReview
    .filter((r) => showDrafts || !r.isDraft)
    .filter((r) => !isActive(r.snoozedUntil));
  const address = data.toAddress.filter((a) => !isActive(a.snoozedUntil));

  return (
    <main>
      <header className="topbar">
        <h1>GitHub Monitor</h1>
        <label>
          <input
            type="checkbox"
            checked={showDrafts}
            onChange={(e) => setShowDrafts(e.target.checked)}
          />{" "}
          Show drafts
        </label>
        <button onClick={() => void refresh()}>Refresh</button>
        {data.error && <span className="badge danger">stale ({data.error})</span>}
      </header>
      <div className="columns">
        <section>
          <h2>📥 To Review ({review.length})</h2>
          {review.map((r) => (
            <ReviewCard key={r.key} item={r} onSnooze={onSnooze} />
          ))}
        </section>
        <section>
          <h2>📝 To Address ({address.length})</h2>
          {address.map((a) => (
            <AddressCard key={a.key} item={a} onSnooze={onSnooze} />
          ))}
        </section>
      </div>
    </main>
  );
}
