import { describe, expect, it } from "vitest";
import {
  findMappingProblems,
  isMappingUsable,
  mappingSchema,
  bucketForStatus,
  adBucketForStatus,
} from "@/lib/mapping/schema";
import {
  guessAdBucket,
  guessProperty,
  guessStatusBucket,
  sameId,
  type SchemaProperty,
} from "@/lib/mapping/heuristics";
import {
  applyAdFilters,
  applyMediaFilters,
  parseAdFilters,
  parseMediaFilters,
} from "@/lib/filters";
import type { AdWithRefs, MediaItem } from "@/lib/types";

const minimal = {
  content: { title: "Name", status: "Status", publishDate: "Date", channel: "Type" },
  shorts: { title: "Name", status: "Status", publishDate: "Date" },
  clips: { title: "Name", publishDate: "Date" },
  ads: {
    title: "Name",
    status: "Status",
    company: "Sponsor",
    placementContent: "Episode",
  },
  companies: { title: "Name" },
};

describe("mappingSchema", () => {
  it("fills optional roles with null and buckets with sane defaults", () => {
    const mapping = mappingSchema.parse(minimal);
    expect(mapping.content.owner).toBeNull();
    expect(mapping.content.statusBuckets).toEqual({});
    expect(mapping.content.defaultStatusBucket).toBe("planned");
    expect(mapping.ads.defaultStatusBucket).toBe("owed");
    expect(mapping.version).toBe(1);
  });

  it("rejects a mapping with no title", () => {
    const broken = { ...minimal, companies: { title: "" } };
    expect(mappingSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a status bucket that is not one of ours", () => {
    const broken = {
      ...minimal,
      content: { ...minimal.content, statusBuckets: { Editing: "nonsense" } },
    };
    expect(mappingSchema.safeParse(broken).success).toBe(false);
  });
});

describe("findMappingProblems", () => {
  it("passes a mapping that covers every required role", () => {
    const mapping = mappingSchema.parse(minimal);
    expect(isMappingUsable(mapping)).toBe(true);
    expect(findMappingProblems(mapping).every((p) => p.severity === "warning")).toBe(
      true,
    );
  });

  it("reports a missing required role as an error", () => {
    const mapping = mappingSchema.parse({
      ...minimal,
      content: { ...minimal.content, status: null },
    });
    const problems = findMappingProblems(mapping);
    expect(problems).toContainEqual(
      expect.objectContaining({ database: "content", role: "status", severity: "error" }),
    );
    expect(isMappingUsable(mapping)).toBe(false);
  });

  it("reports missing optional roles only as warnings", () => {
    const mapping = mappingSchema.parse(minimal);
    const owner = findMappingProblems(mapping).find(
      (p) => p.database === "content" && p.role === "owner",
    );
    expect(owner?.severity).toBe("warning");
  });

  it("errors when neither ad placement relation is mapped", () => {
    const mapping = mappingSchema.parse({
      ...minimal,
      ads: { ...minimal.ads, placementContent: null },
    });
    const problems = findMappingProblems(mapping);
    expect(problems).toContainEqual(
      expect.objectContaining({ role: "placement", severity: "error" }),
    );
  });
});

describe("bucket resolution", () => {
  it("falls back when an option is unknown or unset", () => {
    expect(bucketForStatus("Editing", { Editing: "inProgress" }, "planned")).toBe(
      "inProgress",
    );
    expect(bucketForStatus("New one", {}, "planned")).toBe("planned");
    expect(bucketForStatus(null, { Editing: "inProgress" }, "planned")).toBe("planned");
    expect(adBucketForStatus("Placed", { Placed: "placed" }, "owed")).toBe("placed");
  });
});

describe("guessProperty", () => {
  const properties: SchemaProperty[] = [
    { name: "Name", type: "title" },
    { name: "Status", type: "status" },
    { name: "Publish Date", type: "date" },
    { name: "Due", type: "date" },
    { name: "Owner", type: "people" },
    { name: "Type", type: "select" },
    { name: "Sponsor", type: "relation", relationDatabaseId: "co-db" },
    { name: "Episode", type: "relation", relationDatabaseId: "ct-db" },
  ];

  it("matches by name for the common roles", () => {
    expect(guessProperty(properties, "title")).toBe("Name");
    expect(guessProperty(properties, "status")).toBe("Status");
    expect(guessProperty(properties, "publishDate")).toBe("Publish Date");
    expect(guessProperty(properties, "dueDate")).toBe("Due");
    expect(guessProperty(properties, "owner")).toBe("Owner");
  });

  it("only offers type-compatible properties", () => {
    // "Type" is a select, so it cannot fill the date role.
    expect(guessProperty([{ name: "Type", type: "select" }], "publishDate")).toBeNull();
  });

  it("prefers a relation pointing at the expected database", () => {
    expect(
      guessProperty(properties, "company", {
        relationTargets: { company: "co-db" },
      }),
    ).toBe("Sponsor");
    expect(
      guessProperty(properties, "placementContent", {
        relationTargets: { placementContent: "ct-db" },
      }),
    ).toBe("Episode");
  });

  it("compares database ids with and without dashes", () => {
    expect(sameId("abc-def", "ABCDEF")).toBe(true);
    expect(sameId("abc", "abd")).toBe(false);
  });
});

describe("bucket guessing", () => {
  it("reads production intent from the option name", () => {
    expect(guessStatusBucket({ name: "Published" })).toBe("published");
    expect(guessStatusBucket({ name: "Scheduled" })).toBe("scheduled");
    expect(guessStatusBucket({ name: "Editing" })).toBe("inProgress");
    expect(guessStatusBucket({ name: "Idea" })).toBe("planned");
    expect(guessStatusBucket({ name: "Killed" })).toBe("cancelled");
  });

  it("falls back to Notion's own status groups", () => {
    expect(guessStatusBucket({ name: "Xyzzy", groupName: "Complete" })).toBe(
      "published",
    );
    expect(guessStatusBucket({ name: "Xyzzy", groupName: "In progress" })).toBe(
      "inProgress",
    );
    expect(guessStatusBucket({ name: "Xyzzy", groupName: "To-do" })).toBe("planned");
  });

  it("reads ad-lifecycle intent", () => {
    expect(guessAdBucket({ name: "Delivered" })).toBe("published");
    expect(guessAdBucket({ name: "Placed" })).toBe("placed");
    expect(guessAdBucket({ name: "Owed" })).toBe("owed");
    expect(guessAdBucket({ name: "Dropped" })).toBe("cancelled");
  });
});

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "m1",
    source: "content",
    title: "Pricing advisory work",
    notionUrl: "",
    lastEditedTime: null,
    status: { name: "Editing", bucket: "inProgress", color: null },
    publishDate: "2026-06-20",
    channels: ["YouTube"],
    owners: [{ id: "u1", name: "Jake", avatarUrl: null }],
    externalUrl: null,
    parentId: null,
    adIds: [],
    ...overrides,
  };
}

describe("filters", () => {
  it("reads comma-separated and repeated params", () => {
    const filters = parseMediaFilters({
      source: "content,shorts",
      channel: ["YouTube", "Newsletter"],
      status: "inProgress",
      q: "pricing",
    });
    expect(filters.sources).toEqual(["content", "shorts"]);
    expect(filters.channels).toEqual(["YouTube", "Newsletter"]);
    expect(filters.buckets).toEqual(["inProgress"]);
    expect(filters.search).toBe("pricing");
  });

  it("drops values that are not real sources or buckets", () => {
    const filters = parseMediaFilters({ source: "content,bogus", status: "nope" });
    expect(filters.sources).toEqual(["content"]);
    expect(filters.buckets).toEqual([]);
  });

  it("treats an empty filter as no filter", () => {
    const items = [media(), media({ id: "m2", source: "shorts" })];
    expect(applyMediaFilters(items, parseMediaFilters({}))).toHaveLength(2);
  });

  it("narrows by source, channel, status, owner, and search", () => {
    const items = [
      media({ id: "a" }),
      media({ id: "b", source: "shorts", channels: ["Shorts"] }),
      media({
        id: "c",
        status: { name: "Published", bucket: "published", color: null },
      }),
      media({ id: "d", owners: [], title: "Something else" }),
    ];

    expect(
      applyMediaFilters(items, parseMediaFilters({ source: "shorts" })).map((i) => i.id),
    ).toEqual(["b"]);
    expect(
      applyMediaFilters(items, parseMediaFilters({ channel: "YouTube" })).map((i) => i.id),
    ).toEqual(["a", "c", "d"]);
    expect(
      applyMediaFilters(items, parseMediaFilters({ status: "published" })).map((i) => i.id),
    ).toEqual(["c"]);
    expect(
      applyMediaFilters(items, parseMediaFilters({ owner: "u1" })).map((i) => i.id),
    ).toEqual(["a", "b", "c"]);
    expect(
      applyMediaFilters(items, parseMediaFilters({ q: "PRICING" })).map((i) => i.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("filters ads by state, sponsor, placement, and search", () => {
    const ads = [
      {
        id: "a1",
        title: "Ledgerly mid-roll",
        companyId: "co1",
        company: { title: "Ledgerly" },
        placement: null,
        state: "overdue",
      },
      {
        id: "a2",
        title: "TaxPilot host read",
        companyId: "co2",
        company: { title: "TaxPilot" },
        placement: { source: "content", id: "x" },
        state: "live",
      },
    ] as unknown as AdWithRefs[];

    expect(
      applyAdFilters(ads, parseAdFilters({ state: "overdue" })).map((a) => a.id),
    ).toEqual(["a1"]);
    expect(
      applyAdFilters(ads, parseAdFilters({ company: "co2" })).map((a) => a.id),
    ).toEqual(["a2"]);
    expect(
      applyAdFilters(ads, parseAdFilters({ unplaced: "1" })).map((a) => a.id),
    ).toEqual(["a1"]);
    // Search covers the sponsor name as well as the ad title.
    expect(
      applyAdFilters(ads, parseAdFilters({ q: "taxpilot" })).map((a) => a.id),
    ).toEqual(["a2"]);
  });
});
