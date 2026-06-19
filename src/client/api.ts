import type { ItemsResponse } from "../shared/types";

export async function getItems(): Promise<ItemsResponse> {
  const r = await fetch("/api/items");
  if (!r.ok) throw new Error(`items ${r.status}`);
  return (await r.json()) as ItemsResponse;
}

export async function snooze(key: string, until: string | null): Promise<void> {
  await fetch("/api/snooze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, until }),
  });
}
