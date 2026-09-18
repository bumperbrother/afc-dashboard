import { unstable_cache, revalidateTag } from "next/cache";
import { loadMapping } from "@/lib/mapping/load";
import type { Mapping } from "@/lib/mapping/schema";
import { deriveAdState, parseDate } from "@/lib/derive";
import type {
  Ad,
  AdWithRefs,
  Company,
  MediaItem,
  MediaSource,
  Person,
  Snapshot,
  SourceKey,
} from "@/lib/types";
import { getConfigStatus, isMockMode, SOURCE_LABELS } from "./client";
import { fetchAllRows, fetchPagesByIds, recentWindowFilter } from "./query";
import {
  normalizeAd,
  normalizeCompany,
  normalizeMediaItem,
} from "./normalize";
import { getMockData } from "./mock/store";

export const SNAPSHOT_TAG = "notion-snapshot";

/**
 * Writes drop the cache themselves, so this only bounds how stale a read-only
 * session gets. Five minutes keeps a busy morning from re-querying five
 * databases on every click.
 */
const SNAPSHOT_TTL_SECONDS = 300;

/** How far back media is loaded. Everything upcoming is always included. */
const DEFAULT_HISTORY_WINDOW_MONTHS = 6;

export function historyWindowStart(now: Date = new Date()): Date {
  const configured = Number(process.env.HISTORY_WINDOW_MONTHS);
  const months =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_HISTORY_WINDOW_MONTHS;

  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** An empty snapshot, used when nothing is configured yet. */
function emptySnapshot(warnings: string[]): Snapshot {
  return {
    content: [],
    shorts: [],
    clips: [],
    ads: [],
    companies: [],
    fetchedAt: new Date().toISOString(),
    warnings,
    isMock: false,
  };
}

/**
 * Join raw records into the shape the views consume: ads gain their company
 * and the media they sit on, media gains the ids of ads riding on it, and
 * each ad gains its derived delivery state.
 */
export function buildSnapshot(input: {
  content: MediaItem[];
  shorts: MediaItem[];
  clips: MediaItem[];
  ads: Ad[];
  companies: Company[];
  warnings?: string[];
  isMock?: boolean;
  now?: Date;
}): Snapshot {
  const now = input.now ?? new Date();
  const content = input.content.map((item) => ({ ...item, adIds: [] as string[] }));
  const shorts = input.shorts.map((item) => ({ ...item, adIds: [] as string[] }));
  const clips = input.clips.map((item) => ({ ...item, adIds: [] as string[] }));

  const companiesById = new Map(input.companies.map((c) => [c.id, c]));
  const mediaById = new Map<string, MediaItem>();
  for (const item of [...content, ...shorts, ...clips]) {
    mediaById.set(item.id, item);
  }

  const ads: AdWithRefs[] = input.ads.map((ad) => {
    const placedOn = ad.placement ? (mediaById.get(ad.placement.id) ?? null) : null;
    if (placedOn) placedOn.adIds.push(ad.id);
    return {
      ...ad,
      company: ad.companyId ? (companiesById.get(ad.companyId) ?? null) : null,
      placedOn,
      state: deriveAdState(ad, placedOn, now),
    };
  });

  return {
    content,
    shorts,
    clips,
    ads,
    companies: input.companies,
    fetchedAt: new Date().toISOString(),
    warnings: input.warnings ?? [],
    isMock: input.isMock ?? false,
  };
}

/** Load and normalize one media database, tolerating a failure. */
async function loadMedia(
  source: MediaSource,
  mapping: Mapping,
  warnings: string[],
  windowStart: Date,
): Promise<MediaItem[]> {
  const publishDateProperty = mapping[source].publishDate;
  // Without a mapped date property there is nothing to filter on, so fall
  // back to loading everything rather than silently returning nothing.
  const filter = publishDateProperty
    ? recentWindowFilter(publishDateProperty, windowStart)
    : undefined;

  try {
    const rows = await fetchAllRows(source, filter);
    return rows.map((row) => normalizeMediaItem(row, mapping[source], source));
  } catch (error) {
    warnings.push(`${SOURCE_LABELS[source]} could not be loaded: ${describe(error)}`);
    return [];
  }
}

/**
 * Which ad placements point at media we did not load, grouped by database.
 *
 * Split out from the fetch so the decision itself is testable without a
 * Notion client: this is the logic that decides whether a delivered
 * sponsorship gets shown as unplaced.
 */
export function findUnresolvedPlacements(
  ads: Ad[],
  loaded: Map<string, MediaItem>,
): Map<MediaSource, Set<string>> {
  const missingBySource = new Map<MediaSource, Set<string>>();

  for (const ad of ads) {
    if (!ad.placement || loaded.has(ad.placement.id)) continue;
    const source = ad.placement.source;
    const ids = missingBySource.get(source) ?? new Set<string>();
    ids.add(ad.placement.id);
    missingBySource.set(source, ids);
  }

  return missingBySource;
}

/**
 * Pull back media that sits outside the window but still carries an ad.
 *
 * Without this, an ad placed on an older episode finds no target, `placedOn`
 * falls to null, and the tracker reports a long-delivered sponsorship as
 * unplaced. That is worse than slow: it invents work that does not exist.
 */
async function backfillPlacements(
  ads: Ad[],
  loaded: Map<string, MediaItem>,
  mapping: Mapping,
  warnings: string[],
): Promise<MediaItem[]> {
  const missingBySource = findUnresolvedPlacements(ads, loaded);
  if (missingBySource.size === 0) return [];

  const recovered: MediaItem[] = [];
  for (const [source, ids] of missingBySource) {
    try {
      const pages = await fetchPagesByIds([...ids]);
      for (const page of pages) {
        recovered.push(normalizeMediaItem(page, mapping[source], source));
      }
    } catch (error) {
      warnings.push(
        `Some ads point at ${SOURCE_LABELS[source]} outside the loaded window and could not be resolved: ${describe(error)}`,
      );
    }
  }

  return recovered;
}

async function loadSource<T>(
  source: SourceKey,
  warnings: string[],
  normalize: (rows: Awaited<ReturnType<typeof fetchAllRows>>) => T[],
): Promise<T[]> {
  try {
    return normalize(await fetchAllRows(source));
  } catch (error) {
    warnings.push(`${SOURCE_LABELS[source]} could not be loaded: ${describe(error)}`);
    return [];
  }
}

/** Build a fresh snapshot straight from Notion (or the fixtures in mock mode). */
async function loadSnapshot(): Promise<Snapshot> {
  if (isMockMode()) {
    const data = getMockData();
    const windowStart = historyWindowStart();

    // Mock mode applies the same window as the real path, so the fixtures
    // genuinely exercise it: the archive falls outside, and the ads sitting on
    // archived pieces are recovered exactly as they would be against Notion.
    const inWindow = (item: MediaItem) => {
      const date = parseDate(item.publishDate);
      return date === null || date >= windowStart;
    };

    const content = data.content.filter(inWindow);
    const shorts = data.shorts.filter(inWindow);
    const clips = data.clips.filter(inWindow);

    const loaded = new Map<string, MediaItem>();
    for (const item of [...content, ...shorts, ...clips]) loaded.set(item.id, item);

    const missing = findUnresolvedPlacements(data.ads, loaded);
    const recovered: MediaItem[] = [];
    for (const [source, ids] of missing) {
      for (const item of data[source]) {
        if (ids.has(item.id)) recovered.push(item);
      }
    }

    return buildSnapshot({
      content: [...content, ...recovered.filter((i) => i.source === "content")],
      shorts: [...shorts, ...recovered.filter((i) => i.source === "shorts")],
      clips: [...clips, ...recovered.filter((i) => i.source === "clips")],
      ads: data.ads,
      companies: data.companies,
      isMock: true,
    });
  }

  const config = getConfigStatus();
  if (!config.ready) {
    const warnings: string[] = [];
    if (!config.hasToken) warnings.push("NOTION_TOKEN is not set.");
    for (const source of config.missingDatabases) {
      warnings.push(`${SOURCE_LABELS[source]} database id is not set.`);
    }
    return emptySnapshot(warnings);
  }

  const { mapping, error } = await loadMapping();
  if (!mapping) {
    return emptySnapshot([
      error ?? "No property mapping yet. Open Setup to map your Notion properties.",
    ]);
  }

  const warnings: string[] = [];
  const windowStart = historyWindowStart();

  // Ads and companies load in full: both are small, and a sponsor's delivery
  // history is exactly what matters at renewal time.
  const [content, shorts, clips, ads, companies] = await Promise.all([
    loadMedia("content", mapping, warnings, windowStart),
    loadMedia("shorts", mapping, warnings, windowStart),
    loadMedia("clips", mapping, warnings, windowStart),
    loadSource("ads", warnings, (rows) =>
      rows.map((row) => normalizeAd(row, mapping.ads)),
    ),
    loadSource("companies", warnings, (rows) =>
      rows.map((row) => normalizeCompany(row, mapping.companies)),
    ),
  ]);

  const loaded = new Map<string, MediaItem>();
  for (const item of [...content, ...shorts, ...clips]) loaded.set(item.id, item);

  const recovered = await backfillPlacements(ads, loaded, mapping, warnings);

  return buildSnapshot({
    content: [...content, ...recovered.filter((i) => i.source === "content")],
    shorts: [...shorts, ...recovered.filter((i) => i.source === "shorts")],
    clips,
    ads,
    companies,
    warnings,
  });
}

const cachedSnapshot = unstable_cache(loadSnapshot, ["afc-snapshot"], {
  revalidate: SNAPSHOT_TTL_SECONDS,
  tags: [SNAPSHOT_TAG],
});

/**
 * The snapshot every page reads. Cached for a minute so a click-through does
 * not re-query five databases; any write, and the Refresh button, drop it.
 */
export async function getSnapshot(): Promise<Snapshot> {
  // The mock store is mutable per-process, so caching it would hide edits.
  if (isMockMode()) return loadSnapshot();
  return cachedSnapshot();
}

/** Drop the cached snapshot so the next read goes back to Notion. */
export function invalidateSnapshot(): void {
  revalidateTag(SNAPSHOT_TAG);
}

/** Everyone who owns something, for the owner filter and the owner picker. */
export function peopleInSnapshot(snapshot: Snapshot): Person[] {
  const byId = new Map<string, Person>();
  for (const item of [...snapshot.content, ...snapshot.shorts, ...snapshot.clips]) {
    for (const person of item.owners) {
      if (!byId.has(person.id)) byId.set(person.id, person);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every channel name in use, for the channel filter. */
export function channelsInSnapshot(snapshot: Snapshot): string[] {
  const names = new Set<string>();
  for (const item of [...snapshot.content, ...snapshot.shorts, ...snapshot.clips]) {
    for (const channel of item.channels) names.add(channel);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
