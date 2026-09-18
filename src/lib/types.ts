/**
 * Domain types for the dashboard. These are deliberately independent of the
 * Notion API shape: `src/lib/notion/normalize.ts` converts raw Notion pages
 * into these using the property mapping, and every view consumes only these.
 */

/** Which Notion database a record came from. */
export type SourceKey = "content" | "shorts" | "clips" | "ads" | "companies";

/** Sources that hold publishable media. */
export type MediaSource = Extract<SourceKey, "content" | "shorts" | "clips">;

/** Normalized production status, mapped from each database's own options. */
export type StatusBucket =
  | "planned"
  | "inProgress"
  | "scheduled"
  | "published"
  | "cancelled";

/** Normalized ad-delivery status: Owed -> Placed -> Published. */
export type AdBucket = "owed" | "placed" | "published" | "cancelled";

export const STATUS_BUCKETS: StatusBucket[] = [
  "planned",
  "inProgress",
  "scheduled",
  "published",
  "cancelled",
];

export const AD_BUCKETS: AdBucket[] = [
  "owed",
  "placed",
  "published",
  "cancelled",
];

export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  planned: "Planned",
  inProgress: "In progress",
  scheduled: "Scheduled",
  published: "Published",
  cancelled: "Cancelled",
};

export const AD_BUCKET_LABELS: Record<AdBucket, string> = {
  owed: "Owed",
  placed: "Placed",
  published: "Published",
  cancelled: "Cancelled",
};

/** Performance numbers on a published piece. */
export interface Metrics {
  views: number | null;
  opens: number | null;
  clicks: number | null;
}

/** True when a piece has at least one performance number recorded. */
export function hasMetrics(metrics: Metrics): boolean {
  return metrics.views !== null || metrics.opens !== null || metrics.clicks !== null;
}

/** A person from a Notion people property. */
export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** The status value on a record: the raw Notion option plus our bucket. */
export interface StatusValue<B extends string> {
  /** The option name exactly as it reads in Notion, e.g. "Ready to film". */
  name: string | null;
  /** Which dashboard bucket that option maps to. */
  bucket: B;
  /** Notion's own colour for the option, when it has one. */
  color: string | null;
}

/** Fields shared by every normalized record. */
export interface BaseRecord {
  id: string;
  source: SourceKey;
  title: string;
  /** Link back to the page in Notion. */
  notionUrl: string;
  lastEditedTime: string | null;
}

/** A piece of publishable media: main content, a short, or a clip. */
export interface MediaItem extends BaseRecord {
  source: MediaSource;
  status: StatusValue<StatusBucket>;
  /** ISO date (YYYY-MM-DD) or full ISO timestamp, as stored in Notion. */
  publishDate: string | null;
  /** Channel names from the mapped select/multi-select, e.g. ["YouTube"]. */
  channels: string[];
  owners: Person[];
  /** External URL property, e.g. the published video or newsletter link. */
  externalUrl: string | null;
  /** For shorts and clips: the id of the main-content item they came from. */
  parentId: string | null;
  /** Ids of ads placed on this item. Populated by the store's join step. */
  adIds: string[];
  /**
   * Performance numbers, where the properties are mapped and the row has a
   * value. Absent rather than zero when unknown: a video with no view count
   * recorded is not a video with no views.
   */
  metrics: Metrics;
}

/** A sponsor / brand from the companies database. */
export interface Company extends BaseRecord {
  source: "companies";
  status: string | null;
  contact: string | null;
  externalUrl: string | null;
}

/** Where an ad has been placed, if anywhere. */
export interface AdPlacement {
  source: Extract<MediaSource, "content" | "shorts">;
  id: string;
}

/**
 * How an ad is really doing, derived from its status, its placement, and the
 * placement's publish date. This is what the tracker sorts and colours by.
 */
export type AdState =
  | "unplaced" // owed, nothing assigned yet
  | "overdue" // owed and past its due date
  | "dueSoon" // owed, due within the soon window
  | "placedUnscheduled" // assigned, but the media has no publish date
  | "placedUpcoming" // assigned to media with a future publish date
  | "live" // assigned to media that has published
  | "liveUnlinked" // marked published, but nothing is linked to it
  | "cancelled";

export const AD_STATE_LABELS: Record<AdState, string> = {
  unplaced: "Unplaced",
  overdue: "Overdue",
  dueSoon: "Due soon",
  placedUnscheduled: "Placed, no date",
  placedUpcoming: "Placed, upcoming",
  live: "Live",
  liveUnlinked: "Live, not linked",
  cancelled: "Cancelled",
};

/** An ad record: something we owe a sponsor. */
export interface Ad extends BaseRecord {
  source: "ads";
  status: StatusValue<AdBucket>;
  companyId: string | null;
  placement: AdPlacement | null;
  dueDate: string | null;
  adType: string | null;
  notes: string | null;
}

/** An ad joined with the company and media item it points at. */
export interface AdWithRefs extends Ad {
  company: Company | null;
  placedOn: MediaItem | null;
  state: AdState;
}

/** Everything the dashboard needs for one render, loaded in one pass. */
export interface Snapshot {
  content: MediaItem[];
  shorts: MediaItem[];
  clips: MediaItem[];
  ads: AdWithRefs[];
  companies: Company[];
  /** ISO timestamp of when this snapshot was built. */
  fetchedAt: string;
  /** Non-fatal problems, e.g. one database failed to load. */
  warnings: string[];
  /** True when the data came from bundled fixtures rather than Notion. */
  isMock: boolean;
}

/** All media items across the three media databases. */
export function allMedia(snapshot: Snapshot): MediaItem[] {
  return [...snapshot.content, ...snapshot.shorts, ...snapshot.clips];
}

/** Index media items by id for quick lookup. */
export function mediaById(snapshot: Snapshot): Map<string, MediaItem> {
  return new Map(allMedia(snapshot).map((item) => [item.id, item]));
}
