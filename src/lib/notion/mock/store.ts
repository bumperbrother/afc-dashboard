import type { Ad, Company, MediaItem, MediaSource, Person } from "@/lib/types";
import {
  MOCK_ADS,
  MOCK_AD_STATUS_OPTIONS,
  MOCK_CLIPS,
  MOCK_COMPANIES,
  MOCK_CONTENT,
  MOCK_CONTENT_STATUS_OPTIONS,
  MOCK_PEOPLE,
  MOCK_SHORTS,
} from "./fixtures";

/**
 * Mutable in-memory copy of the fixtures. Mutations in mock mode write here,
 * so every editing path in the UI can be exercised without a Notion token.
 * State lives on globalThis so it survives Next's dev-server module reloads.
 */

interface MockState {
  content: MediaItem[];
  shorts: MediaItem[];
  clips: MediaItem[];
  ads: Ad[];
  companies: Company[];
}

const GLOBAL_KEY = "__afcMockState";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createState(): MockState {
  return {
    content: clone(MOCK_CONTENT),
    shorts: clone(MOCK_SHORTS),
    clips: clone(MOCK_CLIPS),
    ads: clone(MOCK_ADS),
    companies: clone(MOCK_COMPANIES),
  };
}

function state(): MockState {
  const globals = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MockState;
  };
  if (!globals[GLOBAL_KEY]) globals[GLOBAL_KEY] = createState();
  return globals[GLOBAL_KEY];
}

export function getMockData(): MockState {
  return clone(state());
}

export function mockPeople(): Person[] {
  return clone(MOCK_PEOPLE);
}

export function mockStatusOptions(source: MediaSource | "ads") {
  return source === "ads"
    ? clone(MOCK_AD_STATUS_OPTIONS)
    : clone(MOCK_CONTENT_STATUS_OPTIONS);
}

function mediaList(source: MediaSource): MediaItem[] {
  return state()[source];
}

function findMedia(id: string): MediaItem | null {
  for (const source of ["content", "shorts", "clips"] as MediaSource[]) {
    const found = mediaList(source).find((item) => item.id === id);
    if (found) return found;
  }
  return null;
}

export function mockUpdateStatus(id: string, optionName: string): void {
  const item = findMedia(id);
  if (item) {
    const option = MOCK_CONTENT_STATUS_OPTIONS.find((o) => o.name === optionName);
    if (option) item.status = { ...option };
    return;
  }

  const ad = state().ads.find((candidate) => candidate.id === id);
  if (ad) {
    const option = MOCK_AD_STATUS_OPTIONS.find((o) => o.name === optionName);
    if (option) ad.status = { ...option };
  }
}

export function mockUpdatePublishDate(id: string, date: string | null): void {
  const item = findMedia(id);
  if (item) item.publishDate = date;
}

export function mockUpdateDueDate(id: string, date: string | null): void {
  const ad = state().ads.find((candidate) => candidate.id === id);
  if (ad) ad.dueDate = date;
}

export function mockUpdateOwner(id: string, personIds: string[]): void {
  const item = findMedia(id);
  if (!item) return;
  item.owners = MOCK_PEOPLE.filter((person) => personIds.includes(person.id));
}

export function mockPlaceAd(
  adId: string,
  target: { source: "content" | "shorts"; id: string } | null,
): void {
  const ad = state().ads.find((candidate) => candidate.id === adId);
  if (!ad) return;
  ad.placement = target ? { ...target } : null;
}

/** Reset back to the shipped fixtures. Used by tests and the demo banner. */
export function mockReset(): void {
  const globals = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MockState;
  };
  globals[GLOBAL_KEY] = createState();
}
