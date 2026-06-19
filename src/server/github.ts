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
