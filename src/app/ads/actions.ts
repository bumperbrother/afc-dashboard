"use server";

import { getSnapshot } from "@/lib/notion/store";
import { parseDate } from "@/lib/derive";
import type { MediaSource } from "@/lib/types";

/**
 * Searching for somewhere to place an ad used to happen in the browser, which
 * meant every content and shorts row was serialised into the page whether or
 * not anyone opened the picker. At a few thousand rows that is the single
 * largest thing on the wire. The search runs on the server now, and only the
 * handful of rows actually shown come back.
 */

/** Just enough to render one row of the placement picker. */
export interface PlacementCandidate {
  id: string;
  source: Extract<MediaSource, "content" | "shorts">;
  title: string;
  channel: string | null;
  publishDate: string | null;
  statusName: string | null;
  statusBucket: string;
  /** How many ads already sit on this piece. */
  adCount: number;
  /** True when it has not published yet, which is usually what you want. */
  upcoming: boolean;
}

const RESULT_LIMIT = 40;

/**
 * Find placement targets matching `query`. Clips are never offered: they
 * carry no sponsorships.
 */
export async function searchPlacementTargets(
  query: string,
): Promise<PlacementCandidate[]> {
  const snapshot = await getSnapshot();
  const search = query.trim().toLowerCase();
  const now = Date.now();

  const candidates = [...snapshot.content, ...snapshot.shorts]
    .filter((item) => !search || item.title.toLowerCase().includes(search))
    .map((item) => {
      const date = parseDate(item.publishDate);
      const time = date ? date.getTime() : null;
      return {
        item,
        time,
        upcoming: time !== null && time >= now,
      };
    })
    // Upcoming first and soonest first within that, since an ad almost always
    // goes on something that has not gone out yet. Published pieces stay
    // reachable below, for recording where an ad actually ran.
    .sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      if (a.time === null) return b.time === null ? 0 : 1;
      if (b.time === null) return -1;
      return a.upcoming ? a.time - b.time : b.time - a.time;
    })
    .slice(0, RESULT_LIMIT);

  return candidates.map(({ item, upcoming }) => ({
    id: item.id,
    source: item.source as Extract<MediaSource, "content" | "shorts">,
    title: item.title,
    channel: item.channels[0] ?? null,
    publishDate: item.publishDate,
    statusName: item.status.name,
    statusBucket: item.status.bucket,
    adCount: item.adIds.length,
    upcoming,
  }));
}
