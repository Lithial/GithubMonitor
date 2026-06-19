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
