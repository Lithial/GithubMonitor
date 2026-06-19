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

function isPR<T extends { number?: number }>(n: T): n is T & { number: number } {
  return typeof n.number === "number";
}

function toThread(t: RawReviewThread, viewer: string): AddressThread {
  const comments = t.comments.nodes;
  const first = comments[0];
  const last = comments[comments.length - 1];
  const lastCommentAuthor = last?.author?.login ?? "unknown";
  const body = first?.bodyText ?? "";
  const snippet =
    body.length <= SNIPPET_MAX ? body : body.slice(0, SNIPPET_MAX - 1) + "\u2026";
  return {
    id: t.id,
    author: first?.author?.login ?? "unknown",
    lastCommentAuthor,
    path: first?.path ?? "",
    line: first?.line ?? null,
    snippet,
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
