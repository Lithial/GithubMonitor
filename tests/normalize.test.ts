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

describe("normalize edge coverage", () => {
  it("breaks ties by ageDays desc when yourTurnCount is equal (S8)", () => {
    const p: BacklogPayload = {
      rateLimit: { remaining: 1, resetAt: null },
      toReview: { nodes: [] },
      mine: {
        nodes: [
          { number: 30, title: "newer", url: "u30", createdAt: days(2), updatedAt: days(1), repository: { nameWithOwner: "o/r" }, reviewDecision: null, reviewThreads: { nodes: [{ id: "n30", isResolved: false, isOutdated: false, comments: { nodes: [{ author: { login: "alice" }, bodyText: "fix", path: "a.ts", line: 1, url: "c30" }] } }] } },
          { number: 31, title: "older", url: "u31", createdAt: days(20), updatedAt: days(1), repository: { nameWithOwner: "o/r" }, reviewDecision: null, reviewThreads: { nodes: [{ id: "n31", isResolved: false, isOutdated: false, comments: { nodes: [{ author: { login: "alice" }, bodyText: "fix", path: "b.ts", line: 1, url: "c31" }] } }] } },
        ],
      },
    };
    const { toAddress } = normalize(p, "me", {}, NOW);
    expect(toAddress.map((a) => a.number)).toEqual([31, 30]); // equal yourTurnCount=1; older (31) first
  });

  it("truncates a long snippet to 200 chars with an ellipsis", () => {
    const p: BacklogPayload = {
      rateLimit: { remaining: 1, resetAt: null },
      toReview: { nodes: [] },
      mine: { nodes: [{ number: 40, title: "long", url: "u40", createdAt: days(1), updatedAt: days(1), repository: { nameWithOwner: "o/r" }, reviewDecision: null, reviewThreads: { nodes: [{ id: "n40", isResolved: false, isOutdated: false, comments: { nodes: [{ author: { login: "alice" }, bodyText: "x".repeat(500), path: "a.ts", line: 1, url: "c40" }] } }] } }] },
    };
    const { toAddress } = normalize(p, "me", {}, NOW);
    const snip = toAddress[0].threads[0].snippet;
    expect(snip.length).toBe(200);
    expect(snip.endsWith("\u2026")).toBe(true);
  });

  it("drops non-PR / empty search nodes (isPR guard)", () => {
    const p: BacklogPayload = {
      rateLimit: { remaining: 1, resetAt: null },
      toReview: { nodes: [{}, { number: 50, title: "real", url: "u50", isDraft: false, createdAt: days(1), updatedAt: days(1), repository: { nameWithOwner: "o/r" }, author: { login: "a" }, labels: { nodes: [] } }] },
      mine: { nodes: [{}] },
    };
    const { toReview, toAddress } = normalize(p, "me", {}, NOW);
    expect(toReview.map((r) => r.number)).toEqual([50]);
    expect(toAddress).toEqual([]);
  });
});
