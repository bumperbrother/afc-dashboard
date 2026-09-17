import { describe, expect, it } from "vitest";
import {
  computeOverviewStats,
  daysBetween,
  dayKey,
  deriveAdState,
  mediaInRange,
  parseDate,
  startOfWeek,
  summarizeDelivery,
} from "@/lib/derive";
import { buildSnapshot } from "@/lib/notion/store";
import type { Ad, MediaItem } from "@/lib/types";

const NOW = new Date("2026-06-15T12:00:00");

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m1",
    source: "content",
    title: "An item",
    notionUrl: "https://notion.so/m1",
    lastEditedTime: null,
    status: { name: "Scheduled", bucket: "scheduled", color: null },
    publishDate: "2026-06-20",
    channels: ["YouTube"],
    owners: [],
    externalUrl: null,
    parentId: null,
    adIds: [],
    ...overrides,
  };
}

function ad(overrides: Partial<Ad> = {}): Ad {
  return {
    id: "a1",
    source: "ads",
    title: "An ad",
    notionUrl: "https://notion.so/a1",
    lastEditedTime: null,
    status: { name: "Owed", bucket: "owed", color: null },
    companyId: "c1",
    placement: null,
    dueDate: null,
    adType: null,
    notes: null,
    ...overrides,
  };
}

describe("parseDate", () => {
  it("anchors a bare date to local noon so day grouping never slips", () => {
    const parsed = parseDate("2026-06-20");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(5);
    expect(parsed?.getDate()).toBe(20);
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });

  it("round-trips through dayKey", () => {
    expect(dayKey(parseDate("2026-01-05")!)).toBe("2026-01-05");
  });
});

describe("daysBetween", () => {
  it("counts whole days and goes negative for the past", () => {
    expect(daysBetween(NOW, new Date("2026-06-18T23:00:00"))).toBe(3);
    expect(daysBetween(NOW, new Date("2026-06-10T01:00:00"))).toBe(-5);
    expect(daysBetween(NOW, new Date("2026-06-15T23:59:00"))).toBe(0);
  });
});

describe("deriveAdState", () => {
  it("is unplaced when nothing is assigned and nothing is due", () => {
    expect(deriveAdState(ad(), null, NOW)).toBe("unplaced");
  });

  it("is overdue when the due date has passed with no placement", () => {
    expect(deriveAdState(ad({ dueDate: "2026-06-01" }), null, NOW)).toBe("overdue");
  });

  it("is due soon inside the 14-day window", () => {
    expect(deriveAdState(ad({ dueDate: "2026-06-25" }), null, NOW)).toBe("dueSoon");
  });

  it("stays unplaced when the due date is far out", () => {
    expect(deriveAdState(ad({ dueDate: "2026-08-01" }), null, NOW)).toBe("unplaced");
  });

  it("flags a placement that has no publish date", () => {
    const target = media({ publishDate: null });
    const placed = ad({ placement: { source: "content", id: target.id } });
    expect(deriveAdState(placed, target, NOW)).toBe("placedUnscheduled");
  });

  it("is upcoming when the placement publishes in the future", () => {
    const target = media({ publishDate: "2026-07-01" });
    const placed = ad({ placement: { source: "content", id: target.id } });
    expect(deriveAdState(placed, target, NOW)).toBe("placedUpcoming");
  });

  it("is live once the placement has published", () => {
    const target = media({
      publishDate: "2026-06-01",
      status: { name: "Published", bucket: "published", color: null },
    });
    const placed = ad({ placement: { source: "content", id: target.id } });
    expect(deriveAdState(placed, target, NOW)).toBe("live");
  });

  it("is live when the placement's date has passed even if the status lags", () => {
    const target = media({ publishDate: "2026-06-10" });
    const placed = ad({ placement: { source: "content", id: target.id } });
    expect(deriveAdState(placed, target, NOW)).toBe("live");
  });

  it("trusts a published ad status over the placement", () => {
    const unpublished = media({ publishDate: "2026-09-01" });
    const published = ad({
      status: { name: "Published", bucket: "published", color: null },
      placement: { source: "content", id: unpublished.id },
    });
    expect(deriveAdState(published, unpublished, NOW)).toBe("live");
  });

  it("short-circuits on cancelled", () => {
    const cancelled = ad({
      status: { name: "Cancelled", bucket: "cancelled", color: null },
      dueDate: "2026-01-01",
    });
    expect(deriveAdState(cancelled, null, NOW)).toBe("cancelled");
  });
});

describe("summarizeDelivery", () => {
  it("counts each bucket and separately counts overdue", () => {
    const summary = summarizeDelivery([
      { status: { bucket: "owed" }, state: "overdue" },
      { status: { bucket: "owed" }, state: "unplaced" },
      { status: { bucket: "placed" }, state: "placedUpcoming" },
      { status: { bucket: "published" }, state: "live" },
      { status: { bucket: "cancelled" }, state: "cancelled" },
    ]);

    expect(summary).toMatchObject({
      owed: 2,
      placed: 1,
      published: 1,
      cancelled: 1,
      overdue: 1,
      total: 5,
    });
  });
});

describe("startOfWeek", () => {
  it("starts on Monday", () => {
    // 2026-06-15 is a Monday; 2026-06-21 is the Sunday that ends that week.
    expect(dayKey(startOfWeek(new Date("2026-06-15T12:00:00")))).toBe("2026-06-15");
    expect(dayKey(startOfWeek(new Date("2026-06-21T12:00:00")))).toBe("2026-06-15");
  });
});

describe("mediaInRange", () => {
  it("keeps only dated items inside the range, earliest first", () => {
    const items = [
      media({ id: "late", publishDate: "2026-06-20" }),
      media({ id: "early", publishDate: "2026-06-16" }),
      media({ id: "outside", publishDate: "2026-07-20" }),
      media({ id: "undated", publishDate: null }),
    ];
    const inRange = mediaInRange(
      items,
      new Date("2026-06-15T00:00:00"),
      new Date("2026-06-21T23:59:59"),
    );
    expect(inRange.map((item) => item.id)).toEqual(["early", "late"]);
  });
});

describe("buildSnapshot", () => {
  it("joins ads to their company and placement, and back-links ad ids", () => {
    const target = media({ id: "ct1" });
    const short = media({ id: "sh1", source: "shorts", channels: ["Shorts"] });
    const snapshot = buildSnapshot({
      content: [target],
      shorts: [short],
      clips: [],
      ads: [
        ad({ id: "a1", placement: { source: "content", id: "ct1" } }),
        ad({ id: "a2", placement: { source: "shorts", id: "sh1" } }),
        ad({ id: "a3", placement: null }),
      ],
      companies: [
        {
          id: "c1",
          source: "companies",
          title: "Ledgerly",
          notionUrl: "https://notion.so/c1",
          lastEditedTime: null,
          status: null,
          contact: null,
          externalUrl: null,
        },
      ],
      now: NOW,
    });

    expect(snapshot.ads[0].company?.title).toBe("Ledgerly");
    expect(snapshot.ads[0].placedOn?.id).toBe("ct1");
    expect(snapshot.ads[1].placedOn?.id).toBe("sh1");
    expect(snapshot.ads[2].placedOn).toBeNull();
    expect(snapshot.content[0].adIds).toEqual(["a1"]);
    expect(snapshot.shorts[0].adIds).toEqual(["a2"]);
  });

  it("does not mutate the records it was handed", () => {
    const target = media({ id: "ct1" });
    buildSnapshot({
      content: [target],
      shorts: [],
      clips: [],
      ads: [ad({ placement: { source: "content", id: "ct1" } })],
      companies: [],
      now: NOW,
    });
    expect(target.adIds).toEqual([]);
  });

  it("leaves a placement pointing at a missing page unresolved", () => {
    const snapshot = buildSnapshot({
      content: [],
      shorts: [],
      clips: [],
      ads: [ad({ placement: { source: "content", id: "gone" } })],
      companies: [],
      now: NOW,
    });
    expect(snapshot.ads[0].placedOn).toBeNull();
    expect(snapshot.ads[0].state).toBe("unplaced");
  });
});

describe("computeOverviewStats", () => {
  it("counts the week's output, ad risk, and what is missing", () => {
    const snapshot = buildSnapshot({
      content: [
        media({ id: "c1", publishDate: "2026-06-16", channels: ["YouTube"] }),
        media({ id: "c2", publishDate: "2026-06-18", channels: ["Newsletter"] }),
        media({ id: "c3", publishDate: null, owners: [] }),
        media({
          id: "c4",
          publishDate: "2026-01-01",
          status: { name: "Published", bucket: "published", color: null },
        }),
      ],
      shorts: [],
      clips: [],
      ads: [
        ad({ id: "a1", dueDate: "2026-06-01" }),
        ad({ id: "a2", dueDate: "2026-06-20" }),
        ad({ id: "a3" }),
      ],
      companies: [],
      now: NOW,
    });

    const stats = computeOverviewStats(snapshot, NOW);
    expect(stats.publishingThisWeek).toBe(2);
    expect(stats.publishingByChannel).toEqual([
      { channel: "YouTube", count: 1 },
      { channel: "Newsletter", count: 1 },
    ]);
    expect(stats.adsOverdue).toBe(1);
    expect(stats.adsDueSoon).toBe(1);
    expect(stats.adsUnplaced).toBe(3);
    // c4 is published, so it is not counted as missing anything.
    expect(stats.missingDate).toBe(1);
    expect(stats.missingOwner).toBe(3);
  });
});
