import "server-only";
import { isMockMode } from "@/lib/notion/client";
import { loadMapping } from "@/lib/mapping/load";
import { fetchSchema } from "@/lib/notion/query";
import { mockPeople, mockStatusOptions } from "@/lib/notion/mock/store";
import type { MediaSource, Person } from "@/lib/types";

/**
 * The status options a database actually offers, and the people who can own
 * things. Both come from the live Notion schema so the editors only ever
 * offer values Notion will accept.
 */

export interface StatusOption {
  name: string;
  color: string;
}

export interface EditorOptions {
  contentStatus: StatusOption[];
  shortsStatus: StatusOption[];
  clipsStatus: StatusOption[];
  adStatus: StatusOption[];
  people: Person[];
}

const EMPTY: EditorOptions = {
  contentStatus: [],
  shortsStatus: [],
  clipsStatus: [],
  adStatus: [],
  people: [],
};

/** Status options for one database, or an empty list if anything is missing. */
async function optionsFor(
  source: MediaSource | "ads",
  propertyName: string | null,
): Promise<StatusOption[]> {
  if (!propertyName) return [];
  try {
    const schema = await fetchSchema(source);
    const property = schema.properties.find((p) => p.name === propertyName);
    return (property?.options ?? []).map((option) => ({
      name: option.name,
      color: option.color,
    }));
  } catch {
    // A view that cannot list options still renders; the editor just hides.
    return [];
  }
}

/** People who can be assigned, gathered from the mapped owner properties. */
async function peopleFromNotion(): Promise<Person[]> {
  try {
    const { getNotionClient } = await import("@/lib/notion/client");
    const client = getNotionClient();
    if (!client) return [];
    const response = await client.users.list({ page_size: 100 });
    return response.results
      .filter((user) => user.type === "person")
      .map((user) => ({
        id: user.id,
        name: user.name ?? "Unknown",
        avatarUrl: user.avatar_url ?? null,
      }));
  } catch {
    return [];
  }
}

/** Everything the inline editors need to offer valid choices. */
export async function getEditorOptions(): Promise<EditorOptions> {
  if (isMockMode()) {
    return {
      contentStatus: mockStatusOptions("content"),
      shortsStatus: mockStatusOptions("shorts"),
      clipsStatus: mockStatusOptions("clips"),
      adStatus: mockStatusOptions("ads"),
      people: mockPeople(),
    };
  }

  const { mapping } = await loadMapping();
  if (!mapping) return EMPTY;

  const [contentStatus, shortsStatus, clipsStatus, adStatus, people] =
    await Promise.all([
      optionsFor("content", mapping.content.status),
      optionsFor("shorts", mapping.shorts.status),
      optionsFor("clips", mapping.clips.status),
      optionsFor("ads", mapping.ads.status),
      peopleFromNotion(),
    ]);

  return { contentStatus, shortsStatus, clipsStatus, adStatus, people };
}

/** Pick the right status list for a source. */
export function statusOptionsFor(
  options: EditorOptions,
  source: MediaSource | "ads",
): StatusOption[] {
  if (source === "content") return options.contentStatus;
  if (source === "shorts") return options.shortsStatus;
  if (source === "clips") return options.clipsStatus;
  return options.adStatus;
}
