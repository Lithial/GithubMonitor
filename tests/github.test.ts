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
