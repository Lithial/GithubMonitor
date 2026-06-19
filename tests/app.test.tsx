// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/client/api", () => ({
  getItems: vi.fn(),
  snooze: vi.fn(async () => {}),
}));

import { App } from "../src/client/App";
import { getItems } from "../src/client/api";
import type { ItemsResponse } from "../src/shared/types";

const mockGetItems = vi.mocked(getItems);

function resp(over: Partial<ItemsResponse> = {}): ItemsResponse {
  return {
    generatedAt: "2026-06-18T00:00:00Z",
    viewer: "me",
    toReview: [],
    toAddress: [],
    rateLimit: { remaining: 9, resetAt: null },
    error: null,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => mockGetItems.mockReset());

describe("App", () => {
  it("shows a setup message when there is no token", async () => {
    mockGetItems.mockResolvedValue(resp({ error: "no_token" }));
    render(<App />);
    expect(await screen.findByText(/no github token/i)).toBeTruthy();
  });

  it("hides drafts by default and reveals them via the toggle", async () => {
    mockGetItems.mockResolvedValue(
      resp({
        toReview: [
          { key: "o/r#1", repo: "o/r", number: 1, title: "real one", author: "a", url: "u1", isDraft: false, labels: [], updatedAt: "", ageDays: 1, snoozedUntil: null },
          { key: "o/r#2", repo: "o/r", number: 2, title: "draft one", author: "b", url: "u2", isDraft: true, labels: [], updatedAt: "", ageDays: 2, snoozedUntil: null },
        ],
      }),
    );
    render(<App />);
    expect(await screen.findByText("real one")).toBeTruthy();
    expect(screen.queryByText("draft one")).toBeNull();
    fireEvent.click(screen.getByLabelText(/show drafts/i));
    await waitFor(() => expect(screen.queryByText("draft one")).not.toBeNull());
  });
});
