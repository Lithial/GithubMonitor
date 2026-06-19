export type RawActor = { login: string } | null;
export type RawLabel = { name: string };

export type RawReviewComment = {
  author: RawActor;
  bodyText: string;
  path: string;
  line: number | null;
  url: string;
};

export type RawReviewThread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: { nodes: RawReviewComment[] };
};

export type RawReviewPR = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  repository: { nameWithOwner: string };
  author: RawActor;
  labels: { nodes: RawLabel[] };
};

export type RawMinePR = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  repository: { nameWithOwner: string };
  reviewDecision: string | null;
  reviewThreads: { nodes: RawReviewThread[] };
};

export type BacklogPayload = {
  rateLimit: { remaining: number; resetAt: string | null };
  toReview: { nodes: Array<RawReviewPR | Record<string, never>> };
  mine: { nodes: Array<RawMinePR | Record<string, never>> };
};
