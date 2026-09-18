import { afterEach, describe, expect, it } from "vitest";
import { recentWindowFilter } from "@/lib/notion/query";
import { findUnresolvedPlacements, historyWindowStart } from "@/lib/notion/store";
import type { Ad, MediaItem, MediaSource } from "@/lib/types";

/**
 * The recent window is what keeps a few thousand rows from being loaded on
 * every refresh. These tests pin the two things that make it safe: the filter
 * keeps undated work, and the window respects configuration.
 */

const ORIGINAL = process.env.HISTORY_WINDOW_MONTHS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.HISTORY_WINDOW_MONTHS;
  else process.env.HISTORY_WINDOW_MONTHS = ORIGINAL;
});

describe("recentWindowFilter", () => {
  it("keeps recent and upcoming dates, and keeps undated rows too", () => {
    const filter = recentWindowFilter("Publish Date", new Date("2026-03-18T00:00:00"));

    // An item still being planned has no date yet. Dropping those would hide
    // the top of the pipeline, so the filter has to admit them explicitly.
    expect(filter).toEqual({
      or: [
        { property: "Publish Date", date: { on_or_after: "2026-03-18" } },
        { property: "Publish Date", date: { is_empty: true } },
      ],
    });
  });

  it("sends a plain date, not a timestamp, which is what Notion expects", () => {
    const filter = recentWindowFilter("Date", new Date("2026-01-05T23:30:00Z")) as {
      or: Array<{ date: { on_or_after?: string } }>;
    };
    expect(filter.or[0].date.on_or_after).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("historyWindowStart", () => {
  it("defaults to six months back", () => {
    delete process.env.HISTORY_WINDOW_MONTHS;
    const start = historyWindowStart(new Date("2026-09-18T12:00:00"));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // March
  });

  it("honours HISTORY_WINDOW_MONTHS", () => {
    process.env.HISTORY_WINDOW_MONTHS = "1";
    const start = historyWindowStart(new Date("2026-09-18T12:00:00"));
    expect(start.getMonth()).toBe(7); // August
  });

  it("ignores a nonsense value rather than loading nothing", () => {
    process.env.HISTORY_WINDOW_MONTHS = "not a number";
    const start = historyWindowStart(new Date("2026-09-18T12:00:00"));
    expect(start.getMonth()).toBe(2);

    process.env.HISTORY_WINDOW_MONTHS = "0";
    expect(historyWindowStart(new Date("2026-09-18T12:00:00")).getMonth()).toBe(2);
  });

  it("crosses a year boundary correctly", () => {
    delete process.env.HISTORY_WINDOW_MONTHS;
    const start = historyWindowStart(new Date("2026-02-10T12:00:00"));
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(7); // August
  });
});

describe("findUnresolvedPlacements", () => {
  const media = (id: string, source: MediaSource = "content"): MediaItem => ({
    id,
    source,
    title: id,
    notionUrl: "",
    lastEditedTime: null,
    status: { name: null, bucket: "planned", color: null },
    publishDate: null,
    channels: [],
    owners: [],
    externalUrl: null,
    parentId: null,
    adIds: [],
    metrics: { views: null, opens: null, clicks: null },
  });

  const ad = (id: string, placement: Ad["placement"]): Ad => ({
    id,
    source: "ads",
    title: id,
    notionUrl: "",
    lastEditedTime: null,
    status: { name: null, bucket: "placed", color: null },
    companyId: null,
    placement,
    dueDate: null,
    adType: null,
    notes: null,
  });

  it("finds nothing when every placement is already loaded", () => {
    const loaded = new Map([["ct-1", media("ct-1")]]);
    const missing = findUnresolvedPlacements(
      [ad("a1", { source: "content", id: "ct-1" })],
      loaded,
    );
    expect(missing.size).toBe(0);
  });

  it("finds a placement that fell outside the loaded window", () => {
    const missing = findUnresolvedPlacements(
      [ad("a1", { source: "content", id: "old-episode" })],
      new Map(),
    );
    expect(missing.get("content")).toEqual(new Set(["old-episode"]));
  });

  it("groups by database and de-duplicates shared placements", () => {
    const missing = findUnresolvedPlacements(
      [
        ad("a1", { source: "content", id: "ct-old" }),
        ad("a2", { source: "content", id: "ct-old" }),
        ad("a3", { source: "shorts", id: "sh-old" }),
      ],
      new Map(),
    );
    expect(missing.get("content")).toEqual(new Set(["ct-old"]));
    expect(missing.get("shorts")).toEqual(new Set(["sh-old"]));
  });

  it("ignores ads that were never placed", () => {
    expect(findUnresolvedPlacements([ad("a1", null)], new Map()).size).toBe(0);
  });

  it("only asks for what is actually missing", () => {
    const loaded = new Map([["ct-new", media("ct-new")]]);
    const missing = findUnresolvedPlacements(
      [
        ad("a1", { source: "content", id: "ct-new" }),
        ad("a2", { source: "content", id: "ct-old" }),
      ],
      loaded,
    );
    expect(missing.get("content")).toEqual(new Set(["ct-old"]));
  });
});
