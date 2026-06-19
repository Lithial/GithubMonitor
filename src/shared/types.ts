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
