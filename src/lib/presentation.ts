import type {
  AdState,
  MediaSource,
  StatusBucket,
  AdBucket,
} from "@/lib/types";

/**
 * Presentation-only mappings: which colour token each thing wears, and how
 * dates read. Colour choices come from the validated palette in globals.css,
 * so channels get categorical slots and ad states get reserved status colours.
 */

/** Categorical slots, in fixed order. Never cycled: a 9th value gets "other". */
const SERIES_VARS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
  "var(--color-series-8)",
];

/**
 * Channels get a stable slot, so a colour always means the same channel even
 * when a filter removes some of them from view.
 */
const CHANNEL_SLOTS: Record<string, number> = {
  youtube: 0,
  newsletter: 1,
  podcast: 2,
  shorts: 3,
  clips: 4,
};

export function channelColor(channel: string): string {
  const slot = CHANNEL_SLOTS[channel.toLowerCase().replace(/\s+/g, "")];
  if (slot !== undefined) return SERIES_VARS[slot];

  // Anything unrecognised gets a stable slot from its name rather than a
  // generated hue, so the same custom channel keeps the same colour.
  let hash = 0;
  for (let i = 0; i < channel.length; i++) {
    hash = (hash * 31 + channel.charCodeAt(i)) % 997;
  }
  return SERIES_VARS[5 + (hash % 3)];
}

/** Colour for a media item when it has no channel of its own. */
export function sourceColor(source: MediaSource): string {
  if (source === "shorts") return SERIES_VARS[3];
  if (source === "clips") return SERIES_VARS[4];
  return SERIES_VARS[0];
}

export const SOURCE_LABEL: Record<MediaSource, string> = {
  content: "Content",
  shorts: "Short",
  clips: "Clip",
};

/** Ad states wear reserved status colours, always paired with a label. */
export const AD_STATE_COLOR: Record<AdState, string> = {
  unplaced: "var(--color-ink-muted)",
  overdue: "var(--color-critical)",
  dueSoon: "var(--color-warning)",
  placedUnscheduled: "var(--color-serious)",
  placedUpcoming: "var(--color-series-1)",
  live: "var(--color-good)",
  cancelled: "var(--color-ink-muted)",
};

/** Production buckets get a muted ramp; they are state, not identity. */
export const STATUS_BUCKET_COLOR: Record<StatusBucket, string> = {
  planned: "var(--color-ink-muted)",
  inProgress: "var(--color-series-4)",
  scheduled: "var(--color-series-7)",
  published: "var(--color-good)",
  cancelled: "var(--color-ink-muted)",
};

export const AD_BUCKET_COLOR: Record<AdBucket, string> = {
  owed: "var(--color-critical)",
  placed: "var(--color-series-4)",
  published: "var(--color-good)",
  cancelled: "var(--color-ink-muted)",
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Tue 12 Mar" — short, unambiguous, no locale surprises. */
export function formatDate(value: string | Date | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${WEEKDAY[date.getDay()]} ${date.getDate()} ${MONTH[date.getMonth()]}`;
}

/** "12 Mar 2026" for places where the year matters. */
export function formatDateLong(value: string | Date | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return `${date.getDate()} ${MONTH[date.getMonth()]} ${date.getFullYear()}`;
}

/** "in 3 days", "today", "8 days ago". */
export function formatRelative(
  value: string | Date | null,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (!date) return "—";

  const startOfDay = (input: Date) => {
    const copy = new Date(input);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** "3 min ago" for the last-synced line. */
export function formatSince(value: string | Date | null): string {
  const date = toDate(value);
  if (!date) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 7200) return "1 hour ago";
  return `${Math.round(seconds / 3600)} hours ago`;
}

/** The YYYY-MM-DD an <input type="date"> wants. */
export function toDateInputValue(value: string | null): string {
  const date = toDate(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = bare ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
