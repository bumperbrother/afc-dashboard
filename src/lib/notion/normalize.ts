import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import {
  adBucketForStatus,
  bucketForStatus,
  type AdsMapping,
  type CompaniesMapping,
  type ContentMapping,
  type MediaMapping,
} from "@/lib/mapping/schema";
import type {
  Ad,
  AdBucket,
  Company,
  MediaItem,
  MediaSource,
  Metrics,
  Person,
  StatusBucket,
  StatusValue,
} from "@/lib/types";

/**
 * Pure functions that read a Notion page through the property mapping. Every
 * getter tolerates a missing or wrongly typed property by returning an empty
 * value, so a half-finished mapping degrades instead of crashing a view.
 */

type PropertyValue = PageObjectResponse["properties"][string];

function property(
  page: PageObjectResponse,
  name: string | null,
): PropertyValue | null {
  if (!name) return null;
  return page.properties[name] ?? null;
}

/** Concatenate rich text or title runs into a plain string. */
function richTextToPlain(
  runs: Array<{ plain_text: string }> | undefined,
): string {
  if (!runs || runs.length === 0) return "";
  return runs.map((run) => run.plain_text).join("").trim();
}

export function getTitle(page: PageObjectResponse, name: string | null): string {
  const value = property(page, name);
  if (value && value.type === "title") {
    const text = richTextToPlain(value.title);
    if (text) return text;
  }

  // Fall back to whichever property is the title, so a mis-mapped title
  // property still shows something recognisable rather than "Untitled".
  for (const candidate of Object.values(page.properties)) {
    if (candidate.type === "title") {
      const text = richTextToPlain(candidate.title);
      if (text) return text;
    }
  }
  return "Untitled";
}

export function getText(
  page: PageObjectResponse,
  name: string | null,
): string | null {
  const value = property(page, name);
  if (!value) return null;
  if (value.type === "rich_text") return richTextToPlain(value.rich_text) || null;
  if (value.type === "email") return value.email;
  if (value.type === "phone_number") return value.phone_number;
  if (value.type === "url") return value.url;
  if (value.type === "select") return value.select?.name ?? null;
  return null;
}

export function getUrl(
  page: PageObjectResponse,
  name: string | null,
): string | null {
  const value = property(page, name);
  if (!value) return null;
  if (value.type === "url") return value.url;
  if (value.type === "rich_text") {
    const text = richTextToPlain(value.rich_text);
    return text.startsWith("http") ? text : null;
  }
  return null;
}

/** The start date of a date property, as stored (date or timestamp). */
export function getDate(
  page: PageObjectResponse,
  name: string | null,
): string | null {
  const value = property(page, name);
  if (value && value.type === "date") return value.date?.start ?? null;
  if (value && value.type === "created_time") return value.created_time;
  if (value && value.type === "last_edited_time") return value.last_edited_time;
  return null;
}

/** Names from a select, multi-select, or status property. */
export function getNames(
  page: PageObjectResponse,
  name: string | null,
): string[] {
  const value = property(page, name);
  if (!value) return [];
  if (value.type === "select") return value.select ? [value.select.name] : [];
  if (value.type === "multi_select") return value.multi_select.map((o) => o.name);
  if (value.type === "status") return value.status ? [value.status.name] : [];
  return [];
}

/**
 * A numeric value. Rollups and formulas are read as well as plain numbers,
 * since view counts are often rolled up from somewhere else.
 */
export function getNumber(
  page: PageObjectResponse,
  name: string | null,
): number | null {
  const value = property(page, name);
  if (!value) return null;
  if (value.type === "number") return value.number;
  if (value.type === "formula" && value.formula.type === "number") {
    return value.formula.number;
  }
  if (value.type === "rollup" && value.rollup.type === "number") {
    return value.rollup.number;
  }
  return null;
}

export function getPeople(
  page: PageObjectResponse,
  name: string | null,
): Person[] {
  const value = property(page, name);
  if (!value || value.type !== "people") return [];
  return value.people.map((person) => ({
    id: person.id,
    name: "name" in person && person.name ? person.name : "Unknown",
    avatarUrl: "avatar_url" in person ? (person.avatar_url ?? null) : null,
  }));
}

/** Related page ids from a relation property. */
export function getRelationIds(
  page: PageObjectResponse,
  name: string | null,
): string[] {
  const value = property(page, name);
  if (!value || value.type !== "relation") return [];
  return value.relation.map((relation) => relation.id);
}

/** The raw option name and colour of a select or status property. */
function getStatusOption(
  page: PageObjectResponse,
  name: string | null,
): { name: string | null; color: string | null } {
  const value = property(page, name);
  if (value && value.type === "status" && value.status) {
    return { name: value.status.name, color: value.status.color };
  }
  if (value && value.type === "select" && value.select) {
    return { name: value.select.name, color: value.select.color };
  }
  return { name: null, color: null };
}

function getStatus(
  page: PageObjectResponse,
  mapping: { status: string | null; statusBuckets: Record<string, StatusBucket>; defaultStatusBucket: StatusBucket },
): StatusValue<StatusBucket> {
  const option = getStatusOption(page, mapping.status);
  return {
    name: option.name,
    color: option.color,
    bucket: bucketForStatus(
      option.name,
      mapping.statusBuckets,
      mapping.defaultStatusBucket,
    ),
  };
}

function getAdStatus(
  page: PageObjectResponse,
  mapping: AdsMapping,
): StatusValue<AdBucket> {
  const option = getStatusOption(page, mapping.status);
  return {
    name: option.name,
    color: option.color,
    bucket: adBucketForStatus(
      option.name,
      mapping.statusBuckets,
      mapping.defaultStatusBucket,
    ),
  };
}

/** Normalize one page from a media database (content, shorts, or clips). */
export function normalizeMediaItem(
  page: PageObjectResponse,
  mapping: MediaMapping,
  source: MediaSource,
): MediaItem {
  const channelProperty =
    "channel" in mapping ? (mapping as ContentMapping).channel : null;
  const parentProperty = "parent" in mapping ? mapping.parent : null;
  const parentIds = getRelationIds(page, parentProperty);

  return {
    id: page.id,
    source,
    title: getTitle(page, mapping.title),
    notionUrl: page.url,
    lastEditedTime: page.last_edited_time ?? null,
    status: getStatus(page, mapping),
    publishDate: getDate(page, mapping.publishDate),
    channels: getNames(page, channelProperty),
    owners: getPeople(page, mapping.owner),
    externalUrl: getUrl(page, mapping.url),
    parentId: parentIds[0] ?? null,
    adIds: [],
    metrics: {
      views: getNumber(page, mapping.views),
      opens: getNumber(page, mapping.opens),
      clicks: getNumber(page, mapping.clicks),
    } satisfies Metrics,
  };
}

/** Normalize one page from the ads database. */
export function normalizeAd(page: PageObjectResponse, mapping: AdsMapping): Ad {
  const contentIds = getRelationIds(page, mapping.placementContent);
  const shortIds = getRelationIds(page, mapping.placementShorts);
  const companyIds = getRelationIds(page, mapping.company);

  // An ad sits on exactly one piece of media. If both relations somehow hold
  // a value, main content wins, since that is where sponsorships normally run.
  const placement = contentIds[0]
    ? ({ source: "content", id: contentIds[0] } as const)
    : shortIds[0]
      ? ({ source: "shorts", id: shortIds[0] } as const)
      : null;

  return {
    id: page.id,
    source: "ads",
    title: getTitle(page, mapping.title),
    notionUrl: page.url,
    lastEditedTime: page.last_edited_time ?? null,
    status: getAdStatus(page, mapping),
    companyId: companyIds[0] ?? null,
    placement,
    dueDate: getDate(page, mapping.dueDate),
    adType: getNames(page, mapping.adType)[0] ?? null,
    notes: getText(page, mapping.notes),
  };
}

/** Normalize one page from the companies database. */
export function normalizeCompany(
  page: PageObjectResponse,
  mapping: CompaniesMapping,
): Company {
  return {
    id: page.id,
    source: "companies",
    title: getTitle(page, mapping.title),
    notionUrl: page.url,
    lastEditedTime: page.last_edited_time ?? null,
    status: getNames(page, mapping.status)[0] ?? getText(page, mapping.status),
    contact: getText(page, mapping.contact),
    externalUrl: getUrl(page, mapping.url),
  };
}
