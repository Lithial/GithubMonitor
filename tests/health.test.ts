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
