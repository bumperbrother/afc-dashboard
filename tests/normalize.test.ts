import { describe, expect, it } from "vitest";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  getDate,
  getNames,
  getPeople,
  getRelationIds,
  getText,
  getTitle,
  getUrl,
  normalizeAd,
  normalizeCompany,
  normalizeMediaItem,
} from "@/lib/notion/normalize";
import { mappingSchema } from "@/lib/mapping/schema";

/**
 * Pages are built by hand rather than recorded, so each test states exactly
 * which Notion property shape it is exercising.
 */
function page(properties: Record<string, unknown>): PageObjectResponse {
  return {
    object: "page",
    id: "page-1",
    url: "https://www.notion.so/page-1",
    last_edited_time: "2026-06-01T10:00:00.000Z",
    properties,
  } as unknown as PageObjectResponse;
}

const title = (text: string) => ({
  type: "title",
  title: [{ plain_text: text }],
});

const richText = (text: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: text }],
});

const select = (name: string | null) => ({
  type: "select",
  select: name ? { name, color: "blue" } : null,
});

const status = (name: string | null) => ({
  type: "status",
  status: name ? { name, color: "green" } : null,
});

const date = (start: string | null) => ({
  type: "date",
  date: start ? { start, end: null } : null,
});

const relation = (ids: string[]) => ({
  type: "relation",
  relation: ids.map((id) => ({ id })),
});

const people = (entries: Array<{ id: string; name?: string }>) => ({
  type: "people",
  people: entries.map((entry) => ({
    object: "user",
    id: entry.id,
    name: entry.name,
    avatar_url: null,
  })),
});

const mediaMapping = mappingSchema.shape.content.parse({
  title: "Name",
  status: "Status",
  publishDate: "Publish date",
  owner: "Owner",
  url: "Link",
  channel: "Channel",
  statusBuckets: { Editing: "inProgress", Published: "published" },
  defaultStatusBucket: "planned",
});

const adsMapping = mappingSchema.shape.ads.parse({
  title: "Name",
  status: "Status",
  company: "Sponsor",
  placementContent: "Episode",
  placementShorts: "Short",
  dueDate: "Due",
  adType: "Type",
  notes: "Notes",
  statusBuckets: { Owed: "owed", Placed: "placed", Published: "published" },
  defaultStatusBucket: "owed",
});

describe("property getters", () => {
  it("reads a title and falls back to any title property when mis-mapped", () => {
    expect(getTitle(page({ Name: title("Hello") }), "Name")).toBe("Hello");
    expect(getTitle(page({ Name: title("Hello") }), "Wrong")).toBe("Hello");
  });

  it("returns Untitled when there is no text anywhere", () => {
    expect(getTitle(page({ Name: { type: "title", title: [] } }), "Name")).toBe(
      "Untitled",
    );
  });

  it("joins multi-run rich text", () => {
    const value = {
      type: "rich_text",
      rich_text: [{ plain_text: "one " }, { plain_text: "two" }],
    };
    expect(getText(page({ Notes: value }), "Notes")).toBe("one two");
  });

  it("returns null for an unmapped or empty text property", () => {
    expect(getText(page({}), null)).toBeNull();
    expect(getText(page({ Notes: richText("") }), "Notes")).toBeNull();
  });

  it("reads select, multi-select, and status names uniformly", () => {
    expect(getNames(page({ Channel: select("YouTube") }), "Channel")).toEqual([
      "YouTube",
    ]);
    expect(
      getNames(
        page({
          Channel: {
            type: "multi_select",
            multi_select: [{ name: "YouTube" }, { name: "Newsletter" }],
          },
        }),
        "Channel",
      ),
    ).toEqual(["YouTube", "Newsletter"]);
    expect(getNames(page({ Status: status("Editing") }), "Status")).toEqual([
      "Editing",
    ]);
    expect(getNames(page({ Channel: select(null) }), "Channel")).toEqual([]);
  });

  it("reads a date's start and ignores an empty date", () => {
    expect(getDate(page({ D: date("2026-06-20") }), "D")).toBe("2026-06-20");
    expect(getDate(page({ D: date(null) }), "D")).toBeNull();
  });

  it("reads people and relations", () => {
    expect(
      getPeople(page({ Owner: people([{ id: "u1", name: "Mara" }]) }), "Owner"),
    ).toEqual([{ id: "u1", name: "Mara", avatarUrl: null }]);
    expect(getRelationIds(page({ R: relation(["x", "y"]) }), "R")).toEqual([
      "x",
      "y",
    ]);
  });

  it("only treats a URL-shaped rich text value as a link", () => {
    expect(getUrl(page({ L: { type: "url", url: "https://a.example" } }), "L")).toBe(
      "https://a.example",
    );
    expect(getUrl(page({ L: richText("not a link") }), "L")).toBeNull();
  });

  it("returns an empty value when the property type does not match the role", () => {
    expect(getPeople(page({ Owner: select("Mara") }), "Owner")).toEqual([]);
    expect(getRelationIds(page({ R: richText("x") }), "R")).toEqual([]);
    expect(getDate(page({ D: select("nope") }), "D")).toBeNull();
  });
});

describe("normalizeMediaItem", () => {
  it("maps every role onto the domain shape", () => {
    const item = normalizeMediaItem(
      page({
        Name: title("How to price advisory work"),
        Status: status("Editing"),
        "Publish date": date("2026-06-20"),
        Owner: people([{ id: "u1", name: "Jake" }]),
        Link: { type: "url", url: "https://example.com/v" },
        Channel: select("YouTube"),
      }),
      mediaMapping,
      "content",
    );

    expect(item).toMatchObject({
      source: "content",
      title: "How to price advisory work",
      publishDate: "2026-06-20",
      channels: ["YouTube"],
      externalUrl: "https://example.com/v",
      adIds: [],
    });
    expect(item.status).toMatchObject({ name: "Editing", bucket: "inProgress" });
    expect(item.owners[0].name).toBe("Jake");
  });

  it("falls back to the default bucket for an unmapped status option", () => {
    const item = normalizeMediaItem(
      page({ Name: title("x"), Status: status("Brand new option") }),
      mediaMapping,
      "content",
    );
    expect(item.status.bucket).toBe("planned");
    expect(item.status.name).toBe("Brand new option");
  });

  it("survives a page missing every optional property", () => {
    const item = normalizeMediaItem(
      page({ Name: title("Bare") }),
      mediaMapping,
      "shorts",
    );
    expect(item).toMatchObject({
      title: "Bare",
      publishDate: null,
      channels: [],
      owners: [],
      externalUrl: null,
      parentId: null,
    });
    expect(item.status.bucket).toBe("planned");
  });

  it("reads the parent relation on shorts and clips", () => {
    const shortsMapping = mappingSchema.shape.shorts.parse({
      title: "Name",
      parent: "Source",
    });
    const item = normalizeMediaItem(
      page({ Name: title("A short"), Source: relation(["ct-1"]) }),
      shortsMapping,
      "shorts",
    );
    expect(item.parentId).toBe("ct-1");
  });
});

describe("normalizeAd", () => {
  it("prefers the content placement when both relations are filled", () => {
    const record = normalizeAd(
      page({
        Name: title("Ledgerly mid-roll"),
        Status: status("Placed"),
        Sponsor: relation(["co-1"]),
        Episode: relation(["ct-1"]),
        Short: relation(["sh-1"]),
        Due: date("2026-07-01"),
        Type: select("Mid-roll"),
        Notes: richText("Creative approved"),
      }),
      adsMapping,
    );

    expect(record).toMatchObject({
      title: "Ledgerly mid-roll",
      companyId: "co-1",
      placement: { source: "content", id: "ct-1" },
      dueDate: "2026-07-01",
      adType: "Mid-roll",
      notes: "Creative approved",
    });
    expect(record.status.bucket).toBe("placed");
  });

  it("falls back to the shorts placement", () => {
    const record = normalizeAd(
      page({ Name: title("x"), Short: relation(["sh-9"]) }),
      adsMapping,
    );
    expect(record.placement).toEqual({ source: "shorts", id: "sh-9" });
  });

  it("has no placement when both relations are empty", () => {
    const record = normalizeAd(
      page({ Name: title("x"), Episode: relation([]), Short: relation([]) }),
      adsMapping,
    );
    expect(record.placement).toBeNull();
    expect(record.status.bucket).toBe("owed");
  });
});

describe("normalizeCompany", () => {
  it("reads a select status or a text status", () => {
    const fromSelect = normalizeCompany(
      page({ Name: title("Ledgerly"), Status: select("Active") }),
      mappingSchema.shape.companies.parse({ title: "Name", status: "Status" }),
    );
    expect(fromSelect).toMatchObject({ title: "Ledgerly", status: "Active" });

    const fromText = normalizeCompany(
      page({ Name: title("TaxPilot"), Status: richText("Renewal due") }),
      mappingSchema.shape.companies.parse({ title: "Name", status: "Status" }),
    );
    expect(fromText.status).toBe("Renewal due");
  });
});
