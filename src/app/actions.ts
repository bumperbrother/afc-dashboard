"use server";

import { invalidateSnapshot } from "@/lib/notion/store";

/** Drop the cached Notion snapshot so the next render re-queries. */
export async function refreshSnapshot(): Promise<void> {
  invalidateSnapshot();
}
