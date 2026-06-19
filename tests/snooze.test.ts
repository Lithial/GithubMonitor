import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSnooze, setSnooze } from "../src/server/snooze";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ghm-"));
  process.env.GHM_DATA_DIR = dir;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("snooze store", () => {
  it("returns empty state when no file exists", () => {
    expect(readSnooze()).toEqual({});
  });

  it("persists a snooze and reads it back", () => {
    setSnooze("owner/repo#1", "2030-01-01T00:00:00Z");
    expect(readSnooze()["owner/repo#1"]).toBe("2030-01-01T00:00:00Z");
  });

  it("clears a snooze when until is null", () => {
    setSnooze("k", "2030-01-01T00:00:00Z");
    setSnooze("k", null);
    expect(readSnooze()).toEqual({});
  });
});
