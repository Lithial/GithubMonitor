# GitHub Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web dashboard showing two live lists — PRs awaiting my review, and my PRs with unresolved review comments — across all repos I touch.

**Architecture:** A small Fastify + TypeScript backend resolves the local `gh` token, runs one batched GitHub GraphQL query, and normalizes the payload (pure function) into the pinned API contract. A Vite + React UI renders two columns and deep-links to github.com. Only user snooze state is persisted locally (a JSON file); GitHub data is always read live.

**Tech Stack:** Node ≥20 (global `fetch`), TypeScript (strict, ESM), Fastify 5, React 19 + Vite 6, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-06-18-github-monitor-design.md` (contract + seam claims S1–S11, decision rules DR1–DR3).

## Global Constraints

- Node `>=20`; package is ESM (`"type": "module"`).
- TypeScript `strict: true`; no `any` in committed code.
- Token resolved server-side via `gh auth token`, falling back to `GITHUB_TOKEN`. The token is NEVER sent to the browser.
- No persistence of GitHub state. The only local store is `.data/snooze.json` (`{ [key]: ISO8601 }`).
- Test runner: Vitest. Server tests run in `environment: node`; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
- v1 caps each list at the first 50 results (pagination is out of scope).
- Snooze keys: PR-level = `"<owner>/<name>#<number>"`; thread-level = the GraphQL `reviewThread.id`.

---

## File Structure

```
githubMonitor/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .gitignore
├── src/
│   ├── shared/types.ts          # the pinned API contract (client + server)
│   ├── server/
│   │   ├── raw-types.ts         # GraphQL payload shapes
│   │   ├── normalize.ts         # PURE: payload -> {toReview, toAddress}
│   │   ├── snooze.ts            # JSON store IO
│   │   ├── github.ts            # token + GraphQL fetch
│   │   ├── items.ts             # assemble ItemsResponse + last-good cache
│   │   ├── index.ts            # buildServer() routes + static
│   │   └── main.ts             # listen()
│   └── client/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts
│       ├── components/{ReviewCard,AddressCard,ThreadRow}.tsx
│       └── styles.css
└── tests/
    ├── normalize.test.ts
    ├── snooze.test.ts
    ├── github.test.ts
    ├── items.test.ts
    └── app.test.tsx
```

---

## Task 1: Project scaffold + contract types + booting server

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/shared/types.ts`, `src/server/index.ts`, `src/server/main.ts`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/styles.css`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces: the contract types in `src/shared/types.ts` (`ReviewItem`, `AddressThread`, `AddressItem`, `ReviewDecision`, `ItemsError`, `ItemsResponse`, `SnoozeState`) and `buildServer(): FastifyInstance`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "github-monitor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "concurrently -k -n server,client \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch src/server/main.ts",
    "dev:client": "vite",
    "build": "vite build",
    "start": "NODE_ENV=production tsx src/server/main.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@fastify/static": "^8.0.0",
    "fastify": "^5.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "concurrently": "^9.1.0",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { outDir: "dist" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.data/
*.log
```

- [ ] **Step 6: Create `src/shared/types.ts`** (the pinned contract)

```ts
export type ReviewItem = {
  key: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  url: string;
  isDraft: boolean;
  labels: string[];
  updatedAt: string;
  ageDays: number;
  snoozedUntil: string | null;
};

export type AddressThread = {
  id: string;
  author: string;
  lastCommentAuthor: string;
  path: string;
  line: number | null;
  snippet: string;
  url: string;
  isOutdated: boolean;
  yourTurn: boolean;
};

export type ReviewDecision =
  | "CHANGES_REQUESTED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | null;

export type AddressItem = {
  key: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  reviewDecision: ReviewDecision;
  unresolvedCount: number;
  yourTurnCount: number;
  threads: AddressThread[];
  ageDays: number;
  snoozedUntil: string | null;
};

export type ItemsError = "no_token" | "rate_limited" | "network" | null;

export type ItemsResponse = {
  generatedAt: string;
  viewer: string;
  toReview: ReviewItem[];
  toAddress: AddressItem[];
  rateLimit: { remaining: number; resetAt: string | null };
  error: ItemsError;
};

export type SnoozeState = Record<string, string>;
```

- [ ] **Step 7: Create `src/server/index.ts`** (health route only for now)

```ts
import Fastify, { type FastifyInstance } from "fastify";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true, tokenPresent: false }));

  return app;
}
```

- [ ] **Step 8: Create `src/server/main.ts`**

```ts
import { buildServer } from "./index";

const app = buildServer();
const port = Number(process.env.PORT ?? 8787);
app
  .listen({ port, host: "127.0.0.1" })
  .then(() => console.log(`github-monitor on http://127.0.0.1:${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 9: Create `src/client/App.tsx` and `src/client/main.tsx` and `src/client/styles.css`**

`src/client/App.tsx`:
```tsx
export function App() {
  return <h1>GitHub Monitor</h1>;
}
```

`src/client/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/client/styles.css`:
```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; padding: 1rem; }
```

- [ ] **Step 10: Write the failing health test** — `tests/health.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server/index";

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });
});
```

- [ ] **Step 11: Install and verify**

Run: `npm install`
Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold project, contract types, booting server"
```

---

## Task 2: Snooze store (TDD)

**Files:**
- Create: `src/server/snooze.ts`
- Test: `tests/snooze.test.ts`

**Interfaces:**
- Produces: `readSnooze(): SnoozeState`, `setSnooze(key: string, until: string | null): void`, `snoozeFilePath(): string`. Data dir is `process.env.GHM_DATA_DIR ?? ".data"`.

- [ ] **Step 1: Write the failing test** — `tests/snooze.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ghm-"));
  process.env.GHM_DATA_DIR = dir;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("snooze store", () => {
  it("returns empty state when no file exists", async () => {
    const { readSnooze } = await import("../src/server/snooze");
    expect(readSnooze()).toEqual({});
  });

  it("persists a snooze and reads it back", async () => {
    const { readSnooze, setSnooze } = await import("../src/server/snooze");
    setSnooze("owner/repo#1", "2030-01-01T00:00:00Z");
    expect(readSnooze()["owner/repo#1"]).toBe("2030-01-01T00:00:00Z");
  });

  it("clears a snooze when until is null", async () => {
    const { readSnooze, setSnooze } = await import("../src/server/snooze");
    setSnooze("k", "2030-01-01T00:00:00Z");
    setSnooze("k", null);
    expect(readSnooze()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/snooze.test.ts`
Expected: FAIL (cannot find `../src/server/snooze`).

- [ ] **Step 3: Implement `src/server/snooze.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SnoozeState } from "../shared/types";

function dataDir(): string {
  return process.env.GHM_DATA_DIR ?? ".data";
}

export function snoozeFilePath(): string {
  return join(dataDir(), "snooze.json");
}

export function readSnooze(): SnoozeState {
  const path = snoozeFilePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SnoozeState;
  } catch {
    return {};
  }
}

export function setSnooze(key: string, until: string | null): void {
  const state = readSnooze();
  if (until === null) {
    delete state[key];
  } else {
    state[key] = until;
  }
  const path = snoozeFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/snooze.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: snooze JSON store"
```

---

## Task 3: Normalizer — the heart (TDD)

**Files:**
- Create: `src/server/raw-types.ts`, `src/server/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: `SnoozeState` from `src/shared/types`.
- Produces:
  - `BacklogPayload` (raw GraphQL shape) in `raw-types.ts`.
  - `isSnoozed(until: string | null | undefined, now: Date): boolean`
  - `normalize(payload: BacklogPayload, viewer: string, snooze: SnoozeState, now: Date): { toReview: ReviewItem[]; toAddress: AddressItem[] }`

- [ ] **Step 1: Create `src/server/raw-types.ts`**

```ts
export type RawActor = { login: string } | null;
export type RawLabel = { name: string };

export type RawReviewComment = {
  author: RawActor;
  bodyText: string;
  path: string;
  line: number | null;
  url: string;
};

export type RawReviewThread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: { nodes: RawReviewComment[] };
};

export type RawReviewPR = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  repository: { nameWithOwner: string };
  author: RawActor;
  labels: { nodes: RawLabel[] };
};

export type RawMinePR = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  repository: { nameWithOwner: string };
  reviewDecision: string | null;
  reviewThreads: { nodes: RawReviewThread[] };
};

export type BacklogPayload = {
  rateLimit: { remaining: number; resetAt: string | null };
  toReview: { nodes: Array<RawReviewPR | Record<string, never>> };
  mine: { nodes: Array<RawMinePR | Record<string, never>> };
};
```

- [ ] **Step 2: Write the failing test** — `tests/normalize.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalize, isSnoozed } from "../src/server/normalize";
import type { BacklogPayload } from "../src/server/raw-types";

const NOW = new Date("2026-06-18T00:00:00Z");
const days = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

function payload(): BacklogPayload {
  return {
    rateLimit: { remaining: 4990, resetAt: "2026-06-18T01:00:00Z" },
    toReview: {
      nodes: [
        {
          number: 10,
          title: "newer review",
          url: "u10",
          isDraft: false,
          createdAt: days(2),
          updatedAt: days(1),
          repository: { nameWithOwner: "o/r" },
          author: { login: "alice" },
          labels: { nodes: [{ name: "bug" }] },
        },
        {
          number: 11,
          title: "older draft",
          url: "u11",
          isDraft: true,
          createdAt: days(30),
          updatedAt: days(5),
          repository: { nameWithOwner: "o/r" },
          author: { login: "bob" },
          labels: { nodes: [] },
        },
      ],
    },
    mine: {
      nodes: [
        {
          number: 20,
          title: "two unresolved + one resolved",
          url: "u20",
          createdAt: days(3),
          updatedAt: days(1),
          repository: { nameWithOwner: "o/r" },
          reviewDecision: "CHANGES_REQUESTED",
          reviewThreads: {
            nodes: [
              {
                id: "t-mine",
                isResolved: false,
                isOutdated: false,
                comments: {
                  nodes: [
                    { author: { login: "me" }, bodyText: "I replied last", path: "a.ts", line: 1, url: "ct1" },
                  ],
                },
              },
              {
                id: "t-theirs",
                isResolved: false,
                isOutdated: false,
                comments: {
                  nodes: [
                    { author: { login: "alice" }, bodyText: "please fix", path: "b.ts", line: 2, url: "ct2" },
                  ],
                },
              },
              {
                id: "t-resolved",
                isResolved: true,
                isOutdated: false,
                comments: { nodes: [{ author: { login: "alice" }, bodyText: "ok", path: "c.ts", line: 3, url: "ct3" }] },
              },
            ],
          },
        },
        {
          number: 21,
          title: "only resolved, no decision -> excluded",
          url: "u21",
          createdAt: days(1),
          updatedAt: days(1),
          repository: { nameWithOwner: "o/r" },
          reviewDecision: null,
          reviewThreads: {
            nodes: [
              { id: "r1", isResolved: true, isOutdated: false, comments: { nodes: [{ author: { login: "x" }, bodyText: "done", path: "d.ts", line: null, url: "ct4" }] } },
            ],
          },
        },
        {
          number: 22,
          title: "changes requested, zero unresolved -> included",
          url: "u22",
          createdAt: days(10),
          updatedAt: days(2),
          repository: { nameWithOwner: "o/r" },
          reviewDecision: "CHANGES_REQUESTED",
          reviewThreads: { nodes: [] },
        },
      ],
    },
  };
}

describe("isSnoozed", () => {
  it("is true only for a future timestamp", () => {
    expect(isSnoozed("2030-01-01T00:00:00Z", NOW)).toBe(true);
    expect(isSnoozed("2000-01-01T00:00:00Z", NOW)).toBe(false);
    expect(isSnoozed(null, NOW)).toBe(false);
    expect(isSnoozed(undefined, NOW)).toBe(false);
  });
});

describe("normalize toReview", () => {
  it("sorts oldest first and sets draft + ageDays + snooze", () => {
    const { toReview } = normalize(payload(), "me", { "o/r#10": "2030-01-01T00:00:00Z" }, NOW);
    expect(toReview.map((r) => r.number)).toEqual([11, 10]); // S3: ageDays desc
    expect(toReview.find((r) => r.number === 11)!.isDraft).toBe(true); // S2
    expect(toReview.find((r) => r.number === 10)!.snoozedUntil).toBe("2030-01-01T00:00:00Z"); // S4
    expect(toReview.find((r) => r.number === 10)!.labels).toEqual(["bug"]);
  });
});

describe("normalize toAddress", () => {
  it("applies the inclusion rule, counts, your-turn, and sort", () => {
    const { toAddress } = normalize(payload(), "me", {}, NOW);
    // S5: PR 21 excluded (only resolved, no changes requested)
    expect(toAddress.map((a) => a.number).sort()).toEqual([20, 22]);
    const pr20 = toAddress.find((a) => a.number === 20)!;
    expect(pr20.unresolvedCount).toBe(2); // S6 (resolved excluded)
    expect(pr20.yourTurnCount).toBe(1); // S6/S7 (only t-theirs)
    expect(pr20.threads[0].id).toBe("t-theirs"); // S8: yourTurn first
    expect(pr20.threads.find((t) => t.id === "t-theirs")!.yourTurn).toBe(true);
    expect(pr20.threads.find((t) => t.id === "t-mine")!.yourTurn).toBe(false);
    const pr22 = toAddress.find((a) => a.number === 22)!;
    expect(pr22.unresolvedCount).toBe(0); // included via CHANGES_REQUESTED
  });

  it("excludes a thread-level snoozed thread from counts (S9)", () => {
    const { toAddress } = normalize(payload(), "me", { "t-theirs": "2030-01-01T00:00:00Z" }, NOW);
    const pr20 = toAddress.find((a) => a.number === 20)!;
    expect(pr20.unresolvedCount).toBe(1);
    expect(pr20.yourTurnCount).toBe(0);
  });

  it("sorts by yourTurnCount desc then ageDays desc (S8)", () => {
    const { toAddress } = normalize(payload(), "me", {}, NOW);
    expect(toAddress.map((a) => a.number)).toEqual([20, 22]); // 20 has yourTurn=1, 22 has 0
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL (cannot find `../src/server/normalize`).

- [ ] **Step 4: Implement `src/server/normalize.ts`**

```ts
import type {
  BacklogPayload,
  RawMinePR,
  RawReviewPR,
  RawReviewThread,
} from "./raw-types";
import type {
  AddressItem,
  AddressThread,
  ReviewDecision,
  ReviewItem,
  SnoozeState,
} from "../shared/types";

const DAY_MS = 86_400_000;
const SNIPPET_MAX = 200;

export function isSnoozed(
  until: string | null | undefined,
  now: Date,
): boolean {
  return until != null && new Date(until).getTime() > now.getTime();
}

function ageDays(createdAt: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / DAY_MS);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}

function isPR<T extends { number?: number }>(n: T): n is T & { number: number } {
  return typeof n.number === "number";
}

function toThread(t: RawReviewThread, viewer: string): AddressThread {
  const comments = t.comments.nodes;
  const first = comments[0];
  const last = comments[comments.length - 1];
  const lastCommentAuthor = last?.author?.login ?? "unknown";
  return {
    id: t.id,
    author: first?.author?.login ?? "unknown",
    lastCommentAuthor,
    path: first?.path ?? "",
    line: first?.line ?? null,
    snippet: truncate(first?.bodyText ?? "", SNIPPET_MAX),
    url: first?.url ?? "",
    isOutdated: t.isOutdated,
    yourTurn: lastCommentAuthor !== viewer,
  };
}

export function normalize(
  payload: BacklogPayload,
  viewer: string,
  snooze: SnoozeState,
  now: Date,
): { toReview: ReviewItem[]; toAddress: AddressItem[] } {
  const toReview: ReviewItem[] = (payload.toReview.nodes as RawReviewPR[])
    .filter(isPR)
    .map((pr) => {
      const key = `${pr.repository.nameWithOwner}#${pr.number}`;
      return {
        key,
        repo: pr.repository.nameWithOwner,
        number: pr.number,
        title: pr.title,
        author: pr.author?.login ?? "unknown",
        url: pr.url,
        isDraft: pr.isDraft,
        labels: pr.labels.nodes.map((l) => l.name),
        updatedAt: pr.updatedAt,
        ageDays: ageDays(pr.createdAt, now),
        snoozedUntil: snooze[key] ?? null,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);

  const toAddress: AddressItem[] = (payload.mine.nodes as RawMinePR[])
    .filter(isPR)
    .map((pr) => {
      const key = `${pr.repository.nameWithOwner}#${pr.number}`;
      const threads = pr.reviewThreads.nodes
        .filter((t) => !t.isResolved && !isSnoozed(snooze[t.id], now))
        .map((t) => toThread(t, viewer))
        .sort((a, b) => Number(b.yourTurn) - Number(a.yourTurn));
      const decision = (pr.reviewDecision as ReviewDecision) ?? null;
      return {
        key,
        repo: pr.repository.nameWithOwner,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        reviewDecision: decision,
        unresolvedCount: threads.length,
        yourTurnCount: threads.filter((t) => t.yourTurn).length,
        threads,
        ageDays: ageDays(pr.createdAt, now),
        snoozedUntil: snooze[key] ?? null,
      };
    })
    .filter(
      (item) =>
        item.unresolvedCount > 0 || item.reviewDecision === "CHANGES_REQUESTED",
    )
    .sort(
      (a, b) => b.yourTurnCount - a.yourTurnCount || b.ageDays - a.ageDays,
    );

  return { toReview, toAddress };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: normalizer with detection rules S1-S9"
```

---

## Task 4: GitHub client (token + GraphQL)

**Files:**
- Create: `src/server/github.ts`
- Test: `tests/github.test.ts`

**Interfaces:**
- Consumes: `BacklogPayload` from `raw-types`.
- Produces:
  - `resolveToken(): string | null`
  - `buildSearchQueries(login: string): { reviewQ: string; mineQ: string }`
  - `getViewerLogin(token: string): Promise<string>`
  - `fetchBacklog(token: string, login: string): Promise<BacklogPayload>`
  - `class RateLimitError extends Error`

- [ ] **Step 1: Write the failing test** — `tests/github.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSearchQueries,
  getViewerLogin,
  fetchBacklog,
  RateLimitError,
} from "../src/server/github";

afterEach(() => vi.restoreAllMocks());

describe("buildSearchQueries", () => {
  it("interpolates the login (never @me)", () => {
    const { reviewQ, mineQ } = buildSearchQueries("octo");
    expect(reviewQ).toContain("review-requested:octo");
    expect(mineQ).toContain("author:octo");
    expect(reviewQ).not.toContain("@me");
  });
});

describe("getViewerLogin", () => {
  it("parses viewer.login from a GraphQL response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { viewer: { login: "octo" } } }), { status: 200 }),
      ),
    );
    expect(await getViewerLogin("tok")).toBe("octo");
  });
});

describe("fetchBacklog", () => {
  it("throws RateLimitError on HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(fetchBacklog("tok", "octo")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("returns data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { rateLimit: { remaining: 1, resetAt: null }, toReview: { nodes: [] }, mine: { nodes: [] } } }),
          { status: 200 },
        ),
      ),
    );
    const out = await fetchBacklog("tok", "octo");
    expect(out.rateLimit.remaining).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/github.test.ts`
Expected: FAIL (cannot find `../src/server/github`).

- [ ] **Step 3: Implement `src/server/github.ts`**

```ts
import { execFileSync } from "node:child_process";
import type { BacklogPayload } from "./raw-types";

export class RateLimitError extends Error {}

export function resolveToken(): string | null {
  try {
    const t = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
    if (t) return t;
  } catch {
    /* gh missing or not authed — fall through */
  }
  return process.env.GITHUB_TOKEN?.trim() || null;
}

export function buildSearchQueries(login: string): {
  reviewQ: string;
  mineQ: string;
} {
  return {
    reviewQ: `is:open is:pr review-requested:${login} archived:false`,
    mineQ: `is:open is:pr author:${login} archived:false`,
  };
}

const VIEWER_QUERY = `{ viewer { login } }`;

const BACKLOG_QUERY = `
query Backlog($reviewQ: String!, $mineQ: String!) {
  rateLimit { remaining resetAt }
  toReview: search(query: $reviewQ, type: ISSUE, first: 50) {
    nodes { ... on PullRequest {
      number title url isDraft createdAt updatedAt
      repository { nameWithOwner }
      author { login }
      labels(first: 20) { nodes { name } }
    } }
  }
  mine: search(query: $mineQ, type: ISSUE, first: 50) {
    nodes { ... on PullRequest {
      number title url createdAt updatedAt
      repository { nameWithOwner }
      reviewDecision
      reviewThreads(first: 50) {
        nodes {
          id isResolved isOutdated
          comments(first: 50) { nodes { author { login } bodyText path line url } }
        }
      }
    } }
  }
}`;

async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "github-monitor",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 403 || res.status === 429) {
    throw new RateLimitError(`github ${res.status}`);
  }
  if (!res.ok) throw new Error(`github ${res.status}`);
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    if (json.errors.some((e) => /rate limit/i.test(e.message))) {
      throw new RateLimitError(json.errors[0].message);
    }
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("github: empty data");
  return json.data;
}

export async function getViewerLogin(token: string): Promise<string> {
  const data = await gql<{ viewer: { login: string } }>(token, VIEWER_QUERY, {});
  return data.viewer.login;
}

export async function fetchBacklog(
  token: string,
  login: string,
): Promise<BacklogPayload> {
  const { reviewQ, mineQ } = buildSearchQueries(login);
  return gql<BacklogPayload>(token, BACKLOG_QUERY, { reviewQ, mineQ });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/github.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: github graphql client + token resolution"
```

---

## Task 5: Assemble ItemsResponse + API routes (TDD)

**Files:**
- Create: `src/server/items.ts`
- Modify: `src/server/index.ts` (replace whole file)
- Test: `tests/items.test.ts`

**Interfaces:**
- Consumes: `resolveToken`, `getViewerLogin`, `fetchBacklog`, `RateLimitError` (github), `normalize`, `readSnooze`, `setSnooze`.
- Produces:
  - `buildItems(deps?: Partial<ItemsDeps>): Promise<ItemsResponse>` with injectable deps for testing.
  - `__resetCache(): void` (test helper).
  - `buildServer()` now serves `GET /api/items`, `POST /api/snooze`, `GET /api/health`.

- [ ] **Step 1: Write the failing test** — `tests/items.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildItems, __resetCache } from "../src/server/items";
import { RateLimitError } from "../src/server/github";
import type { BacklogPayload } from "../src/server/raw-types";

const NOW = new Date("2026-06-18T00:00:00Z");
const emptyPayload: BacklogPayload = {
  rateLimit: { remaining: 9, resetAt: null },
  toReview: { nodes: [] },
  mine: { nodes: [] },
};

beforeEach(() => __resetCache());

describe("buildItems", () => {
  it("returns no_token error with empty lists and 200-shape (S10)", async () => {
    const res = await buildItems({ resolveToken: () => null, now: () => NOW });
    expect(res.error).toBe("no_token");
    expect(res.toReview).toEqual([]);
    expect(res.toAddress).toEqual([]);
  });

  it("returns normalized data on success", async () => {
    const res = await buildItems({
      resolveToken: () => "tok",
      getViewerLogin: async () => "me",
      fetchBacklog: async () => emptyPayload,
      readSnooze: () => ({}),
      now: () => NOW,
    });
    expect(res.error).toBeNull();
    expect(res.viewer).toBe("me");
    expect(res.rateLimit.remaining).toBe(9);
  });

  it("serves last-good cache with error flag after a failure", async () => {
    const ok = {
      resolveToken: () => "tok",
      getViewerLogin: async () => "me",
      fetchBacklog: async () => emptyPayload,
      readSnooze: () => ({}),
      now: () => NOW,
    };
    await buildItems(ok); // populate cache
    const res = await buildItems({
      ...ok,
      getViewerLogin: async () => {
        throw new RateLimitError("boom");
      },
    });
    expect(res.error).toBe("rate_limited");
    expect(res.viewer).toBe("me"); // from cache
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/items.test.ts`
Expected: FAIL (cannot find `../src/server/items`).

- [ ] **Step 3: Implement `src/server/items.ts`**

```ts
import {
  fetchBacklog,
  getViewerLogin,
  RateLimitError,
  resolveToken,
} from "./github";
import { normalize } from "./normalize";
import { readSnooze } from "./snooze";
import type { ItemsError, ItemsResponse } from "../shared/types";

export type ItemsDeps = {
  resolveToken: typeof resolveToken;
  getViewerLogin: typeof getViewerLogin;
  fetchBacklog: typeof fetchBacklog;
  readSnooze: typeof readSnooze;
  now: () => Date;
};

let lastGood: ItemsResponse | null = null;

export function __resetCache(): void {
  lastGood = null;
}

function empty(now: Date, error: ItemsError): ItemsResponse {
  return {
    generatedAt: now.toISOString(),
    viewer: "",
    toReview: [],
    toAddress: [],
    rateLimit: { remaining: 0, resetAt: null },
    error,
  };
}

export async function buildItems(
  deps: Partial<ItemsDeps> = {},
): Promise<ItemsResponse> {
  const d: ItemsDeps = {
    resolveToken,
    getViewerLogin,
    fetchBacklog,
    readSnooze,
    now: () => new Date(),
    ...deps,
  };
  const now = d.now();
  const token = d.resolveToken();
  if (!token) return empty(now, "no_token");

  try {
    const login = await d.getViewerLogin(token);
    const payload = await d.fetchBacklog(token, login);
    const { toReview, toAddress } = normalize(payload, login, d.readSnooze(), now);
    const resp: ItemsResponse = {
      generatedAt: now.toISOString(),
      viewer: login,
      toReview,
      toAddress,
      rateLimit: payload.rateLimit,
      error: null,
    };
    lastGood = resp;
    return resp;
  } catch (e) {
    const error: ItemsError = e instanceof RateLimitError ? "rate_limited" : "network";
    return lastGood ? { ...lastGood, error } : empty(now, error);
  }
}
```

- [ ] **Step 4: Replace `src/server/index.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { buildItems } from "./items";
import { resolveToken } from "./github";
import { setSnooze } from "./snooze";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({
    ok: true,
    tokenPresent: resolveToken() != null,
  }));

  app.get("/api/items", async () => buildItems());

  app.post("/api/snooze", async (req, reply) => {
    const { key, until } = req.body as { key: string; until: string | null };
    setSnooze(key, until ?? null);
    reply.code(204);
    return null;
  });

  return app;
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/items.test.ts`
Expected: PASS (3 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: items assembly with last-good cache + api routes"
```

---

## Task 6: Client UI (TDD on the key behaviors)

**Files:**
- Create: `src/client/api.ts`, `src/client/components/ReviewCard.tsx`, `src/client/components/AddressCard.tsx`, `src/client/components/ThreadRow.tsx`
- Modify: `src/client/App.tsx` (replace whole file), `src/client/styles.css`
- Test: `tests/app.test.tsx`

**Interfaces:**
- Consumes: `ItemsResponse`, `ReviewItem`, `AddressItem`, `AddressThread` from `src/shared/types`.
- Produces: `getItems()`, `snooze(key, until)` in `api.ts`; `<App />` rendering two columns, a "Show drafts" toggle, a no-token message, a stale badge, and snooze buttons.

- [ ] **Step 1: Create `src/client/api.ts`**

```ts
import type { ItemsResponse } from "../shared/types";

export async function getItems(): Promise<ItemsResponse> {
  const r = await fetch("/api/items");
  if (!r.ok) throw new Error(`items ${r.status}`);
  return (await r.json()) as ItemsResponse;
}

export async function snooze(key: string, until: string | null): Promise<void> {
  await fetch("/api/snooze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, until }),
  });
}
```

- [ ] **Step 2: Create the components**

`src/client/components/ThreadRow.tsx`:
```tsx
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
```

`src/client/components/AddressCard.tsx`:
```tsx
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
```

`src/client/components/ReviewCard.tsx`:
```tsx
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
```

- [ ] **Step 3: Write the failing test** — `tests/app.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/client/api", () => ({
  getItems: vi.fn(),
  snooze: vi.fn(async () => {}),
}));

import { App } from "../src/client/App";
import { getItems } from "../src/client/api";
import type { ItemsResponse } from "../src/shared/types";

const mockGetItems = vi.mocked(getItems);

function resp(over: Partial<ItemsResponse> = {}): ItemsResponse {
  return {
    generatedAt: "2026-06-18T00:00:00Z",
    viewer: "me",
    toReview: [],
    toAddress: [],
    rateLimit: { remaining: 9, resetAt: null },
    error: null,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => mockGetItems.mockReset());

describe("App", () => {
  it("shows a setup message when there is no token", async () => {
    mockGetItems.mockResolvedValue(resp({ error: "no_token" }));
    render(<App />);
    expect(await screen.findByText(/no github token/i)).toBeTruthy();
  });

  it("hides drafts by default and reveals them via the toggle", async () => {
    mockGetItems.mockResolvedValue(
      resp({
        toReview: [
          { key: "o/r#1", repo: "o/r", number: 1, title: "real one", author: "a", url: "u1", isDraft: false, labels: [], updatedAt: "", ageDays: 1, snoozedUntil: null },
          { key: "o/r#2", repo: "o/r", number: 2, title: "draft one", author: "b", url: "u2", isDraft: true, labels: [], updatedAt: "", ageDays: 2, snoozedUntil: null },
        ],
      }),
    );
    render(<App />);
    expect(await screen.findByText("real one")).toBeTruthy();
    expect(screen.queryByText("draft one")).toBeNull();
    fireEvent.click(screen.getByLabelText(/show drafts/i));
    await waitFor(() => expect(screen.queryByText("draft one")).not.toBeNull());
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/app.test.tsx`
Expected: FAIL (App has no token message / draft logic yet).

- [ ] **Step 5: Replace `src/client/App.tsx`**

```tsx
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
```

- [ ] **Step 6: Append layout to `src/client/styles.css`**

```css
.topbar { display: flex; gap: 1rem; align-items: center; }
.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.card { border: 1px solid #8884; border-radius: 8px; padding: 0.75rem; margin: 0.5rem 0; }
.card header { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.badge { font-size: 0.75rem; background: #8882; border-radius: 4px; padding: 0 0.35rem; }
.badge.danger { background: #d33a; color: #fff; }
.threads { list-style: none; padding-left: 0; }
.thread.your-turn { border-left: 3px solid #d33; padding-left: 0.5rem; }
.snippet { font-size: 0.85rem; opacity: 0.8; margin: 0.2rem 0; }
.count, .age, .who { font-size: 0.8rem; opacity: 0.7; }
```

- [ ] **Step 7: Run test + typecheck**

Run: `npx vitest run tests/app.test.tsx`
Expected: PASS (2 tests).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: react dashboard UI with drafts toggle + snooze"
```

---

## Task 7: Production static serving + usage docs + smoke

**Files:**
- Modify: `src/server/index.ts` (replace whole file — add static serving in production)
- Create: `README.md`

**Interfaces:**
- Consumes: everything above. No new exported symbols.

- [ ] **Step 1: Replace `src/server/index.ts`** (adds dist static serving when `NODE_ENV=production`)

```ts
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { buildItems } from "./items";
import { resolveToken } from "./github";
import { setSnooze } from "./snooze";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({
    ok: true,
    tokenPresent: resolveToken() != null,
  }));
  app.get("/api/items", async () => buildItems());
  app.post("/api/snooze", async (req, reply) => {
    const { key, until } = req.body as { key: string; until: string | null };
    setSnooze(key, until ?? null);
    reply.code(204);
    return null;
  });

  if (process.env.NODE_ENV === "production") {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");
    if (existsSync(root)) {
      app.register(fastifyStatic, { root });
      app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
    }
  }

  return app;
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# GitHub Monitor

Local dashboard for two backlogs: PRs awaiting my review, and my PRs with
unresolved review comments — across every repo I touch.

## Requirements
- Node ≥ 20
- `gh auth login` (token auto-detected) or `GITHUB_TOKEN` in the environment

## Develop
```bash
npm install
npm run dev      # API on :8787, UI on http://localhost:5173
```

## Run (single port)
```bash
npm run build && npm start   # http://127.0.0.1:8787
```

## Test
```bash
npm test
npm run typecheck
```
```

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: all suites pass.

- [ ] **Step 4: Live smoke (manual — hits real GitHub)**

Run: `npm run dev`
Then in another shell: `curl -s localhost:8787/api/items | head -c 400`
Expected: JSON with non-empty `toReview` (you have ≥7 review requests) and `viewer` set to your login. Open `http://localhost:5173` and confirm both columns render and a card deep-links to github.com.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: production static serving + usage docs"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- S1 review membership → Task 4 `buildSearchQueries` (`review-requested`) + Task 3 mapping. ✓
- S2 drafts hidden-by-default, flag populated → Task 3 (`isDraft`) + Task 6 toggle/test. ✓
- S3 review sort oldest-first → Task 3 sort + test. ✓
- S4 snoozed excluded from default review view → Task 3 `snoozedUntil` + Task 6 `isActive` filter. ✓
- S5 address inclusion (unresolved OR changes-requested) → Task 3 filter + tests. ✓
- S6 counts → Task 3 + tests. ✓
- S7 your-turn flag → Task 3 `toThread` + test. ✓
- S8 address + thread sort → Task 3 sorts + test. ✓
- S9 thread-level snooze excluded from counts → Task 3 filter + test. ✓
- S10 no-token → 200 + `error:"no_token"` → Task 5 `buildItems` + test. ✓
- S11 normalizer is pure → Task 3 signature `(payload, viewer, snooze, now)`, no IO. ✓
- Contract endpoints (`/api/items`, `/api/snooze`, `/api/health`) → Tasks 1/5/7. ✓
- DR1 (already-reviewed precision): relies on S1 search; the re-review refinement is deferred per the decision rule — no task needed for v1. ✓
- DR2/DR3: heuristic + dual snooze granularity implemented (Task 3). ✓

**Placeholder scan:** none — every code step contains complete content.

**Type consistency:** `ItemsResponse`/`ReviewItem`/`AddressItem`/`AddressThread`/`SnoozeState` defined once in `src/shared/types.ts`; `BacklogPayload` once in `raw-types.ts`; `buildItems`/`ItemsDeps` signatures match between Task 5 definition and its test. `getViewerLogin`/`fetchBacklog`/`resolveToken` names match across github.ts, items.ts, and tests. ✓
