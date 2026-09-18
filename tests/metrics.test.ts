import { describe, expect, it } from "vitest";
import {
  deliveredReach,
  deriveAdState,
  formatCount,
  isAtRisk,
  median,
  performanceByChannel,
} from "@/lib/derive";
import { getNumber } from "@/lib/notion/normalize";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { AdWithRefs, MediaItem } from "@/lib/types";

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m1",
    source: "content",
    title: "An item",
    notionUrl: "",
    lastEditedTime: null,
    status: { name: "Published", bucket: "published", color: null },
    publishDate: "2026-06-01",
    channels: ["YouTube"],
    owners: [],
    externalUrl: null,
    parentId: null,
    adIds: [],
    metrics: { views: null, opens: null, clicks: null },
    ...overrides,
  };
}

function page(properties: Record<string, unknown>): PageObjectResponse {
  return {
    object: "page",
    id: "p1",
    url: "",
    last_edited_time: "2026-06-01T00:00:00.000Z",
    properties,
  } as unknown as PageObjectResponse;
}

describe("getNumber", () => {
  it("reads a plain number, including zero", () => {
    expect(getNumber(page({ Views: { type: "number", number: 1234 } }), "Views")).toBe(1234);
    expect(getNumber(page({ Views: { type: "number", number: 0 } }), "Views")).toBe(0);
  });

  it("reads numbers behind a formula or a rollup", () => {
    const formula = page({
      Views: { type: "formula", formula: { type: "number", number: 42 } },
    });
    expect(getNumber(formula, "Views")).toBe(42);

    const rollup = page({
      Views: { type: "rollup", rollup: { type: "number", number: 99 } },
    });
    expect(getNumber(rollup, "Views")).toBe(99);
  });

  it("returns null for an empty value, an unmapped role, or a wrong type", () => {
    expect(getNumber(page({ Views: { type: "number", number: null } }), "Views")).toBeNull();
    expect(getNumber(page({}), null)).toBeNull();
    expect(getNumber(page({ Views: { type: "rich_text", rich_text: [] } }), "Views")).toBeNull();
  });
});

describe("median", () => {
  it("takes the middle of an odd set and averages the middle of an even one", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 rounded
  });

  it("is null for nothing, and ignores values that are not numbers", () => {
    expect(median([])).toBeNull();
    expect(median([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("resists a single outlier, which is why it is not a mean", () => {
    const typical = [10_000, 11_000, 12_000, 13_000, 1_000_000];
    expect(median(typical)).toBe(12_000);
  });
});

describe("performanceByChannel", () => {
  it("reports a median per channel, strongest first", () => {
    const result = performanceByChannel([
      media({ id: "a", channels: ["YouTube"], metrics: { views: 10_000, opens: null, clicks: null } }),
      media({ id: "b", channels: ["YouTube"], metrics: { views: 30_000, opens: null, clicks: null } }),
      media({ id: "c", channels: ["YouTube"], metrics: { views: 20_000, opens: null, clicks: null } }),
      media({ id: "d", channels: ["Newsletter"], metrics: { views: null, opens: 5_000, clicks: 300 } }),
    ]);

    expect(result[0]).toMatchObject({ channel: "YouTube", medianViews: 20_000, sampleSize: 3 });
    expect(result[1]).toMatchObject({ channel: "Newsletter", medianOpens: 5_000 });
  });

  it("ignores pieces that have not published", () => {
    const result = performanceByChannel([
      media({
        id: "draft",
        status: { name: "Editing", bucket: "inProgress", color: null },
        metrics: { views: 999_999, opens: null, clicks: null },
      }),
    ]);
    expect(result).toEqual([]);
  });

  it("leaves out a channel with nothing recorded rather than showing zero", () => {
    const result = performanceByChannel([media({ id: "x", channels: ["Podcast"] })]);
    expect(result).toEqual([]);
  });

  it("only uses the most recent pieces, so an old average does not linger", () => {
    const items = [
      media({ id: "new", publishDate: "2026-06-01", metrics: { views: 100, opens: null, clicks: null } }),
      media({ id: "old", publishDate: "2020-01-01", metrics: { views: 900, opens: null, clicks: null } }),
    ];
    expect(performanceByChannel(items, 1)[0].medianViews).toBe(100);
  });
});

describe("deliveredReach", () => {
  const ad = (state: string, views: number | null): AdWithRefs =>
    ({
      state,
      placedOn: views === null ? null : media({ metrics: { views, opens: null, clicks: null } }),
    }) as unknown as AdWithRefs;

  it("totals reach across a sponsor's live placements only", () => {
    const result = deliveredReach([
      ad("live", 10_000),
      ad("live", 15_000),
      ad("placedUpcoming", 999_999),
    ]);
    expect(result).toMatchObject({ views: 25_000, placements: 2 });
  });

  it("is null, not zero, when nothing has been recorded", () => {
    const result = deliveredReach([ad("live", null)]);
    expect(result.views).toBeNull();
    expect(result.opens).toBeNull();
  });
});

describe("formatCount", () => {
  it("compacts thousands and millions, and keeps small numbers exact", () => {
    expect(formatCount(950)).toBe("950");
    expect(formatCount(1_200)).toBe("1.2k");
    expect(formatCount(145_000)).toBe("145k");
    expect(formatCount(1_400_000)).toBe("1.4m");
    expect(formatCount(2_000)).toBe("2k");
  });

  it("shows an em dash for nothing recorded", () => {
    expect(formatCount(null)).toBe("—");
  });
});

describe("deriveAdState, published with nothing linked", () => {
  const baseAd = {
    id: "a1",
    source: "ads" as const,
    title: "Ad",
    notionUrl: "",
    lastEditedTime: null,
    companyId: null,
    placement: null,
    dueDate: null,
    adType: null,
    notes: null,
  };

  it("reports live when the ad is published and linked", () => {
    const ad = {
      ...baseAd,
      status: { name: "Published", bucket: "published" as const, color: null },
      placement: { source: "content" as const, id: "ct-1" },
    };
    expect(deriveAdState(ad, media({ id: "ct-1" }))).toBe("live");
  });

  it("flags a published ad that was never linked to a piece of media", () => {
    const ad = {
      ...baseAd,
      status: { name: "Published", bucket: "published" as const, color: null },
    };
    // Previously this read "Live" beside "Not placed", which is a
    // contradiction: it cannot be reported on if nobody recorded where it ran.
    expect(deriveAdState(ad, null)).toBe("liveUnlinked");
  });

  it("counts as work needing attention", () => {
    expect(isAtRisk("liveUnlinked")).toBe(true);
  });
});
