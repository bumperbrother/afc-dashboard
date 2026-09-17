import type { Ad, AdState, MediaItem, Snapshot, StatusBucket } from "@/lib/types";

/** Ads due within this many days count as "due soon". */
export const DUE_SOON_DAYS = 14;

/** Parse a Notion date (YYYY-MM-DD or ISO timestamp) to a Date, or null. */
export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  // A bare date is parsed as UTC midnight by Date; anchor it to local noon so
  // that day-grouping never slips a day either side of the timezone.
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = bare ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local YYYY-MM-DD for a date, used as a calendar cell key. */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** The day key a media item belongs to, or null when it has no date. */
export function itemDayKey(item: MediaItem): string | null {
  const date = parseDate(item.publishDate);
  return date ? dayKey(date) : null;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Buckets that mean the media has gone out. */
const PUBLISHED_BUCKETS: StatusBucket[] = ["published"];

/**
 * Work out how an ad is really doing, from its own status, whether it has a
 * placement, and what that placement's publish date and status say. This is
 * what the tracker sorts, filters, and colours by.
 */
export function deriveAdState(
  ad: Ad,
  placedOn: MediaItem | null,
  now: Date = new Date(),
): AdState {
  if (ad.status.bucket === "cancelled") return "cancelled";

  if (ad.status.bucket === "published") return "live";

  if (!placedOn) {
    const due = parseDate(ad.dueDate);
    if (due) {
      const days = daysBetween(now, due);
      if (days < 0) return "overdue";
      if (days <= DUE_SOON_DAYS) return "dueSoon";
    }
    return "unplaced";
  }

  if (PUBLISHED_BUCKETS.includes(placedOn.status.bucket)) return "live";

  const publishDate = parseDate(placedOn.publishDate);
  if (!publishDate) return "placedUnscheduled";
  if (daysBetween(now, publishDate) < 0) return "live";
  return "placedUpcoming";
}

/** Ad states that need someone to do something. */
export const AT_RISK_STATES: AdState[] = [
  "overdue",
  "dueSoon",
  "placedUnscheduled",
];

export function isAtRisk(state: AdState): boolean {
  return AT_RISK_STATES.includes(state);
}

/** Per-company delivery counts for the tracker headers and overview bars. */
export interface DeliverySummary {
  owed: number;
  placed: number;
  published: number;
  cancelled: number;
  overdue: number;
  total: number;
}

export function summarizeDelivery(
  ads: Array<{ status: { bucket: string }; state: AdState }>,
): DeliverySummary {
  const summary: DeliverySummary = {
    owed: 0,
    placed: 0,
    published: 0,
    cancelled: 0,
    overdue: 0,
    total: 0,
  };

  for (const ad of ads) {
    summary.total += 1;
    if (ad.state === "overdue") summary.overdue += 1;
    switch (ad.status.bucket) {
      case "owed":
        summary.owed += 1;
        break;
      case "placed":
        summary.placed += 1;
        break;
      case "published":
        summary.published += 1;
        break;
      case "cancelled":
        summary.cancelled += 1;
        break;
    }
  }

  return summary;
}

/** Monday-based start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const weekday = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - weekday);
  return copy;
}

export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Media publishing between two dates, earliest first. */
export function mediaInRange(
  items: MediaItem[],
  from: Date,
  to: Date,
): MediaItem[] {
  return items
    .filter((item) => {
      const date = parseDate(item.publishDate);
      if (!date) return false;
      return date >= from && date <= to;
    })
    .sort((a, b) => {
      const aDate = parseDate(a.publishDate)?.getTime() ?? 0;
      const bDate = parseDate(b.publishDate)?.getTime() ?? 0;
      return aDate - bDate;
    });
}

/** Headline numbers for the overview page. */
export interface OverviewStats {
  publishingThisWeek: number;
  publishingByChannel: Array<{ channel: string; count: number }>;
  adsOwed: number;
  adsUnplaced: number;
  adsDueSoon: number;
  adsOverdue: number;
  adsLive: number;
  missingOwner: number;
  missingDate: number;
}

export function computeOverviewStats(
  snapshot: Snapshot,
  now: Date = new Date(),
): OverviewStats {
  const media = [...snapshot.content, ...snapshot.shorts, ...snapshot.clips];
  const thisWeek = mediaInRange(media, startOfWeek(now), endOfWeek(now));

  const channelCounts = new Map<string, number>();
  for (const item of thisWeek) {
    const labels = item.channels.length > 0 ? item.channels : [sourceLabel(item)];
    for (const label of labels) {
      channelCounts.set(label, (channelCounts.get(label) ?? 0) + 1);
    }
  }

  const active = media.filter(
    (item) =>
      item.status.bucket !== "published" && item.status.bucket !== "cancelled",
  );

  return {
    publishingThisWeek: thisWeek.length,
    publishingByChannel: [...channelCounts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    adsOwed: snapshot.ads.filter((ad) => ad.status.bucket === "owed").length,
    adsUnplaced: snapshot.ads.filter(
      (ad) => !ad.placement && ad.status.bucket !== "cancelled",
    ).length,
    adsDueSoon: snapshot.ads.filter((ad) => ad.state === "dueSoon").length,
    adsOverdue: snapshot.ads.filter((ad) => ad.state === "overdue").length,
    adsLive: snapshot.ads.filter((ad) => ad.state === "live").length,
    missingOwner: active.filter((item) => item.owners.length === 0).length,
    missingDate: active.filter((item) => !item.publishDate).length,
  };
}

function sourceLabel(item: MediaItem): string {
  if (item.source === "shorts") return "Shorts";
  if (item.source === "clips") return "Clips";
  return "Content";
}
