import { unstable_cache, revalidateTag } from "next/cache";
import { loadMapping } from "@/lib/mapping/load";
import type { Mapping } from "@/lib/mapping/schema";
import { deriveAdState } from "@/lib/derive";
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
import { fetchAllRows } from "./query";
import {
  normalizeAd,
  normalizeCompany,
  normalizeMediaItem,
} from "./normalize";
import { getMockData } from "./mock/store";

export const SNAPSHOT_TAG = "notion-snapshot";
const SNAPSHOT_TTL_SECONDS = 60;

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
): Promise<MediaItem[]> {
  try {
    const rows = await fetchAllRows(source);
    return rows.map((row) => normalizeMediaItem(row, mapping[source], source));
  } catch (error) {
    warnings.push(`${SOURCE_LABELS[source]} could not be loaded: ${describe(error)}`);
    return [];
  }
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
    return buildSnapshot({ ...data, isMock: true });
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
  const [content, shorts, clips, ads, companies] = await Promise.all([
    loadMedia("content", mapping, warnings),
    loadMedia("shorts", mapping, warnings),
    loadMedia("clips", mapping, warnings),
    loadSource("ads", warnings, (rows) =>
      rows.map((row) => normalizeAd(row, mapping.ads)),
    ),
    loadSource("companies", warnings, (rows) =>
      rows.map((row) => normalizeCompany(row, mapping.companies)),
    ),
  ]);

  return buildSnapshot({ content, shorts, clips, ads, companies, warnings });
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
