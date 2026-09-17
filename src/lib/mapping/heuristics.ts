import type { AdBucket, StatusBucket } from "@/lib/types";

/**
 * Best-guess matching used to pre-fill the /setup page. None of this is
 * authoritative: it only saves the user from picking every dropdown by hand.
 */

/** A property as reported by Notion's database schema. */
export interface SchemaProperty {
  name: string;
  type: string;
  /** For select / multi-select / status properties. */
  options?: Array<{ name: string; color: string; groupName?: string }>;
  /** For relation properties: the database it points at. */
  relationDatabaseId?: string;
}

/** Which Notion property types can serve each dashboard role. */
export const ROLE_TYPES: Record<string, string[]> = {
  title: ["title"],
  status: ["status", "select"],
  publishDate: ["date"],
  dueDate: ["date"],
  owner: ["people"],
  url: ["url"],
  channel: ["select", "multi_select"],
  adType: ["select", "multi_select"],
  notes: ["rich_text"],
  contact: ["rich_text", "email", "phone_number", "people"],
  company: ["relation"],
  placementContent: ["relation"],
  placementShorts: ["relation"],
  parent: ["relation"],
};

/**
 * Name fragments that suggest a property fills a role, most specific first.
 * Matching is case-insensitive and ignores spaces and underscores.
 */
const ROLE_HINTS: Record<string, string[]> = {
  status: ["status", "stage", "state", "progress"],
  publishDate: [
    "publishdate",
    "pubdate",
    "publish",
    "airdate",
    "air",
    "golive",
    "releasedate",
    "release",
    "senddate",
    "date",
  ],
  dueDate: ["duedate", "due", "deadline", "deliverby", "committedby"],
  owner: ["owner", "assignee", "assignedto", "responsible", "editor", "lead"],
  url: ["url", "link", "permalink", "website", "site", "homepage", "published", "watchlink"],
  channel: ["channel", "type", "format", "platform", "medium", "property"],
  adType: ["adtype", "placementtype", "spottype", "format", "type"],
  notes: ["notes", "note", "description", "brief", "details"],
  contact: ["contact", "email", "poc", "pointofcontact"],
  company: ["company", "sponsor", "brand", "client", "advertiser", "partner"],
  placementContent: ["content", "episode", "video", "newsletter", "mainmedia", "placement"],
  placementShorts: ["short", "shorts"],
  parent: ["parent", "source", "origin", "from", "episode", "video"],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_\-/]+/g, "");
}

/**
 * Pick the property most likely to fill `role`, or null when nothing in the
 * schema is even type-compatible.
 */
export function guessProperty(
  properties: SchemaProperty[],
  role: string,
  options: { relationTargets?: Record<string, string | undefined> } = {},
): string | null {
  const allowedTypes = ROLE_TYPES[role] ?? [];
  let candidates = properties.filter((p) => allowedTypes.includes(p.type));
  if (candidates.length === 0) return null;

  // For relation roles, prefer relations that point at the expected database.
  const expectedDb = options.relationTargets?.[role];
  if (expectedDb) {
    const targeted = candidates.filter(
      (p) => p.relationDatabaseId && sameId(p.relationDatabaseId, expectedDb),
    );
    if (targeted.length === 1) return targeted[0].name;
    if (targeted.length > 1) candidates = targeted;
  }

  const hints = ROLE_HINTS[role] ?? [];
  for (const hint of hints) {
    const exact = candidates.find((p) => normalize(p.name) === hint);
    if (exact) return exact.name;
  }
  for (const hint of hints) {
    const partial = candidates.find((p) => normalize(p.name).includes(hint));
    if (partial) return partial.name;
  }

  // Title has exactly one candidate in any Notion database.
  if (role === "title") return candidates[0].name;
  return null;
}

/** Notion database ids appear with and without dashes; compare loosely. */
export function sameId(a: string, b: string): boolean {
  return a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
}

const PUBLISHED_HINTS = ["published", "live", "posted", "sent", "complete", "done", "shipped", "aired"];
const SCHEDULED_HINTS = ["scheduled", "queued", "ready", "approved", "staged", "booked"];
const IN_PROGRESS_HINTS = ["progress", "writing", "scripting", "filming", "recording", "editing", "design", "review", "draft", "doing"];
const CANCELLED_HINTS = ["cancel", "killed", "dropped", "archive", "shelved", "abandoned"];

/**
 * Guess a production bucket for one status option, using Notion's own status
 * groups when present and the option name otherwise.
 */
export function guessStatusBucket(option: {
  name: string;
  groupName?: string;
}): StatusBucket {
  const name = normalize(option.name);
  const group = option.groupName ? normalize(option.groupName) : "";

  if (CANCELLED_HINTS.some((h) => name.includes(h))) return "cancelled";
  if (PUBLISHED_HINTS.some((h) => name.includes(h))) return "published";
  if (SCHEDULED_HINTS.some((h) => name.includes(h))) return "scheduled";
  if (IN_PROGRESS_HINTS.some((h) => name.includes(h))) return "inProgress";

  if (group === "complete") return "published";
  if (group === "inprogress") return "inProgress";
  if (group === "todo") return "planned";
  return "planned";
}

const AD_PUBLISHED_HINTS = ["published", "live", "delivered", "ran", "aired", "complete", "done", "sent"];
const AD_PLACED_HINTS = ["placed", "assigned", "scheduled", "slotted", "booked", "inproduction"];
const AD_OWED_HINTS = ["owed", "unplaced", "pending", "todo", "backlog", "new", "sold"];

/** Guess an ad-lifecycle bucket for one status option. */
export function guessAdBucket(option: {
  name: string;
  groupName?: string;
}): AdBucket {
  const name = normalize(option.name);
  const group = option.groupName ? normalize(option.groupName) : "";

  if (CANCELLED_HINTS.some((h) => name.includes(h))) return "cancelled";
  if (AD_PUBLISHED_HINTS.some((h) => name.includes(h))) return "published";
  if (AD_PLACED_HINTS.some((h) => name.includes(h))) return "placed";
  if (AD_OWED_HINTS.some((h) => name.includes(h))) return "owed";

  if (group === "complete") return "published";
  if (group === "inprogress") return "placed";
  if (group === "todo") return "owed";
  return "owed";
}
