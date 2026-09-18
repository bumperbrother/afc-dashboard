import type {
  AdState,
  AdWithRefs,
  MediaItem,
  MediaSource,
  Snapshot,
  StatusBucket,
} from "@/lib/types";

/**
 * Filters live in the URL query string, so a filtered view is a link a
 * teammate can paste into Slack and land on exactly what you were looking at.
 */

export interface MediaFilters {
  sources: MediaSource[];
  channels: string[];
  buckets: StatusBucket[];
  ownerIds: string[];
  /** Free-text match against the title. */
  search: string;
}

export interface AdFilters {
  companyIds: string[];
  states: AdState[];
  /** Show only ads with no placement. */
  unplacedOnly: boolean;
  search: string;
}

const ALL_SOURCES: MediaSource[] = ["content", "shorts", "clips"];

function list(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function parseMediaFilters(params: SearchParams): MediaFilters {
  const sources = list(params.source).filter((value): value is MediaSource =>
    ALL_SOURCES.includes(value as MediaSource),
  );
  const buckets = list(params.status).filter((value): value is StatusBucket =>
    ["planned", "inProgress", "scheduled", "published", "cancelled"].includes(value),
  );

  return {
    sources,
    channels: list(params.channel),
    buckets,
    ownerIds: list(params.owner),
    search: typeof params.q === "string" ? params.q : "",
  };
}

export function parseAdFilters(params: SearchParams): AdFilters {
  const states = list(params.state).filter((value): value is AdState =>
    [
      "unplaced",
      "overdue",
      "dueSoon",
      "placedUnscheduled",
      "placedUpcoming",
      "live",
      "liveUnlinked",
      "cancelled",
    ].includes(value),
  );

  return {
    companyIds: list(params.company),
    states,
    unplacedOnly: params.unplaced === "1",
    search: typeof params.q === "string" ? params.q : "",
  };
}

/** Apply the media filters. An empty list means "no filter on this field". */
export function applyMediaFilters(
  items: MediaItem[],
  filters: MediaFilters,
): MediaItem[] {
  const search = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.sources.length > 0 && !filters.sources.includes(item.source)) {
      return false;
    }
    if (
      filters.channels.length > 0 &&
      !item.channels.some((channel) => filters.channels.includes(channel))
    ) {
      return false;
    }
    if (filters.buckets.length > 0 && !filters.buckets.includes(item.status.bucket)) {
      return false;
    }
    if (
      filters.ownerIds.length > 0 &&
      !item.owners.some((owner) => filters.ownerIds.includes(owner.id))
    ) {
      return false;
    }
    if (search && !item.title.toLowerCase().includes(search)) return false;
    return true;
  });
}

export function applyAdFilters(
  ads: AdWithRefs[],
  filters: AdFilters,
): AdWithRefs[] {
  const search = filters.search.trim().toLowerCase();

  return ads.filter((ad) => {
    if (
      filters.companyIds.length > 0 &&
      (!ad.companyId || !filters.companyIds.includes(ad.companyId))
    ) {
      return false;
    }
    if (filters.states.length > 0 && !filters.states.includes(ad.state)) {
      return false;
    }
    if (filters.unplacedOnly && ad.placement) return false;
    if (search) {
      const haystack = `${ad.title} ${ad.company?.title ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/** Media from the snapshot, filtered, newest publish date first. */
export function filteredMedia(
  snapshot: Snapshot,
  filters: MediaFilters,
): MediaItem[] {
  return applyMediaFilters(
    [...snapshot.content, ...snapshot.shorts, ...snapshot.clips],
    filters,
  );
}

/** True when any filter is narrowing the view, for the "clear" affordance. */
export function hasActiveMediaFilters(filters: MediaFilters): boolean {
  return (
    filters.sources.length > 0 ||
    filters.channels.length > 0 ||
    filters.buckets.length > 0 ||
    filters.ownerIds.length > 0 ||
    filters.search.trim() !== ""
  );
}

export function hasActiveAdFilters(filters: AdFilters): boolean {
  return (
    filters.companyIds.length > 0 ||
    filters.states.length > 0 ||
    filters.unplacedOnly ||
    filters.search.trim() !== ""
  );
}
