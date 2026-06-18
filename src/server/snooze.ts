import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SnoozeState } from "../shared/types";

export function snoozeFilePath(): string {
  return join(process.env.GHM_DATA_DIR ?? ".data", "snooze.json");
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
