# GitHub Monitor — Design Spec

- **Date:** 2026-06-18
- **Repo:** `Lithial/GithubMonitor`
- **Status:** Draft — awaiting author review (see "Assumptions pending confirmation")

## Goal (one, demoable + falsifiable)

A **local web dashboard** that, given my GitHub identity, shows two live lists drawn from *all* repos I touch:

1. **To Review** — open PRs awaiting my review.
2. **To Address** — my open PRs that have unresolved review comments.

**Demo:** run one command, open `localhost`, see both lists populated from real GitHub data, click a card through to the PR on github.com.
**Falsifiable:** each list's membership is defined by a precise predicate (below) that can be tested against a captured API payload without choosing an implementation.

## Load-bearing decision (surfaced first)

**Reuse the local `gh` token and read GitHub live via Search + GraphQL; keep no local copy of GitHub state.** The app is a stateless *view* over GitHub plus a tiny local store for user-only metadata (snooze/dismiss).

- **Makes easy:** zero auth setup (token already exists), always-fresh data, no sync/migration logic, trivial to reason about and test (pure functions over a fetched payload).
- **Makes hard:** offline use (mitigated by last-good caching), and very large backlogs hit API rate limits (mitigated by one batched query + polling interval).
- Everything downstream is a *consequence* of this, not a new bet.

## Contract (pinned once — everything else refers here)

### Backend HTTP API
| Endpoint | Returns / Body | Purpose |
|---|---|---|
| `GET /api/items` | `{ generatedAt: ISO8601, viewer: string, toReview: ReviewItem[], toAddress: AddressItem[], rateLimit: { remaining, resetAt }, error?: "no_token" \| "rate_limited" \| "network" \| null }` | The whole dashboard state |
| `POST /api/snooze` | `{ key: string, until: ISO8601 \| null }` → `204` | Snooze/dismiss an item (or clear with `null`) |
| `GET /api/health` | `{ ok: boolean, tokenPresent: boolean, viewer?: string }` | Startup/diagnostics |

### Item shapes
```ts
type ReviewItem = {
  key: string;            // `${repo}#${number}` — stable snooze key
  repo: string;           // "owner/name"
  number: number;
  title: string;
  author: string;
  url: string;            // github.com PR url
  isDraft: boolean;
  labels: string[];
  updatedAt: string;      // ISO8601
  ageDays: number;        // derived from createdAt
  snoozedUntil: string | null;
};

type AddressItem = {
  key: string;            // `${repo}#${number}`
  repo: string;
  number: number;
  title: string;
  url: string;
  reviewDecision: "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "APPROVED" | null;
  unresolvedCount: number;
  yourTurnCount: number;  // unresolved threads whose last comment author != viewer
  threads: AddressThread[];
  snoozedUntil: string | null;
};

type AddressThread = {
  id: string;             // GraphQL thread id — stable snooze key for a single thread
  author: string;        // author of the first comment
  lastCommentAuthor: string;
  path: string;           // "file/path.ts"
  line: number | null;
  snippet: string;        // first comment body, truncated
  url: string;            // deep link to the thread
  isOutdated: boolean;
  yourTurn: boolean;      // lastCommentAuthor != viewer
};
```

### Snooze keys
- PR-level: `"<owner>/<name>#<number>"`.
- Thread-level: the GraphQL `reviewThread.id`.

## Seam claims (the body — these ARE the acceptance criteria)

Given the viewer login `V` and a fetched GitHub payload, the normalizer MUST produce:

**To Review**
- S1. Includes a PR **iff** it is `is:open is:pr review-requested:V` at fetch time. (GitHub clears the request when V reviews and re-adds it on re-request, so this predicate alone tracks "needs my review".)
- S2. A draft PR is present in the data but **hidden by default**; a `showDrafts` toggle reveals it. `isDraft` is always populated correctly.
- S3. Sorted by `ageDays` descending (oldest first).
- S4. An item with `snoozedUntil > now` is excluded from the default view and shown only under a "Snoozed" disclosure.

**To Address**
- S5. Includes one of my open PRs **iff** it has ≥1 review thread with `isResolved == false` **after** snooze filtering, **or** its `reviewDecision == "CHANGES_REQUESTED"`.
- S6. `unresolvedCount` == number of unresolved (non-snoozed) threads; `yourTurnCount` == those whose `lastCommentAuthor != V`.
- S7. A thread is marked `yourTurn == true` **iff** `lastCommentAuthor != V`.
- S8. PRs are sorted by `yourTurnCount` descending, then `ageDays` descending; within a PR, threads are sorted `yourTurn` first.
- S9. A thread whose `id` is snoozed past `now` is excluded from counts and the thread list.

**Cross-cutting**
- S10. `GET /api/items` with no/expired token returns `200` with empty lists **and** a machine-readable `error: "no_token"` so the UI can show a fix message — it never 500s on missing auth.
- S11. The normalizer is a **pure function** `(payload, viewer, snoozeState, now) => { toReview, toAddress }` with no I/O.

## Implementation notes (non-binding — a plan may override)

- **Stack (recommended, Approach #1):** Vite + React + TypeScript UI; small **Fastify** + TS backend holding the token and serving the API. Alternatives considered: Next.js single app (pick if hosted path is wanted soon), single server-rendered Node app (smallest footprint).
- **Token source:** run `gh auth token` at startup; fall back to `GITHUB_TOKEN` env. Backend never exposes the token to the browser.
- **One batched GraphQL query** drives `/api/items`: two `search(type: ISSUE)` connections — `is:open is:pr review-requested:@me` and `is:open is:pr author:@me` — the latter selecting `reviewDecision` and `reviewThreads { isResolved, isOutdated, comments { author, bodyText, path, line, url } }`. (Validated against live data: PR #1025 returns 2 unresolved threads with author/path/body.)
- **Snooze store:** a single JSON file under the app's data dir, `{ [key]: ISO8601 }`. Upgrade to SQLite only if concurrent writes or querying become a need.
- **Refresh:** fetch on load + manual refresh button + auto-poll (default every 5 min); show `rateLimit.remaining` and back off near the limit.
- **Last-good cache:** on a failed refresh, keep the previous `/api/items` payload and badge the UI "stale".

## Decision rules (genuine unknowns — observe once, then resolve)

- **DR1 — "already reviewed" precision.** Default to trusting S1 (the `review-requested` search). IF in practice PRs you've reviewed but that were re-requested cause noise, THEN additionally fetch your latest review state per PR and label re-requests as "re-review" rather than hiding.
- **DR2 — thread "your turn" heuristic.** Use S7 (`lastCommentAuthor != V`). IF this misclassifies common cases (e.g. you replied but left it open awaiting them), THEN add a secondary signal: treat a thread as *not* your turn if your last reply is the newest comment regardless of resolution — but still list it under "open, waiting".
- **DR3 — snooze granularity.** Ship PR-level + thread-level snooze (both keys defined above). IF thread-level proves unused, drop it.

## Assumptions pending confirmation (the review gate)

These were chosen as conservative defaults to keep momentum; confirm or override:
1. **Form factor = local web dashboard** (not hosted / TUI / desktop).
2. **Scope = all repos** the viewer is involved in (not a single linked repo).
3. **Read + deep-link only** for v1 (no replying/resolving from the app).
4. **Single user** (you).
5. **Lists = exactly the two above** (no @-mentions or assigned-PRs lists yet).

## Out of scope (explicit fence)
- Hosted deployment + GitHub OAuth (token-local only; promotable later).
- Desktop/push/email notifications.
- Writing back to GitHub (reply, resolve, approve) — deep-link out instead.
- Multi-user / shared state.
- Analytics, history, or trend tracking.
