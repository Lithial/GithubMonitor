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
