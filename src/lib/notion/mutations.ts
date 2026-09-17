"use server";

import type { UpdatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import { loadMapping } from "@/lib/mapping/load";
import type { Mapping } from "@/lib/mapping/schema";
import type { MediaSource } from "@/lib/types";
import { getNotionClient, isMockMode } from "./client";
import { fetchSchema, withRetry } from "./query";
import { invalidateSnapshot } from "./store";
import {
  mockPlaceAd,
  mockUpdateDueDate,
  mockUpdateOwner,
  mockUpdatePublishDate,
  mockUpdateStatus,
} from "./mock/store";

/**
 * Server actions that write back to Notion. Each one resolves the mapped
 * property name, sends a single page update, then drops the cached snapshot
 * so the next render shows the change.
 */

export interface MutationResult {
  ok: boolean;
  error: string | null;
}

const OK: MutationResult = { ok: true, error: null };

function fail(message: string): MutationResult {
  return { ok: false, error: message };
}

type PropertyPayload = NonNullable<UpdatePageParameters["properties"]>;

async function requireMapping(): Promise<
  { mapping: Mapping; error: null } | { mapping: null; error: string }
> {
  const { mapping, error } = await loadMapping();
  if (!mapping) {
    return {
      mapping: null,
      error: error ?? "No property mapping yet. Open Setup to map your properties.",
    };
  }
  return { mapping, error: null };
}

/**
 * Notion needs to know whether a property is `status` or `select` to accept a
 * value for it, and the mapping does not record that. Look it up from the
 * live schema, which is cached per data source by the query layer.
 */
async function statusPayload(
  source: MediaSource | "ads",
  propertyName: string,
  optionName: string,
): Promise<PropertyPayload | null> {
  const schema = await fetchSchema(source);
  const property = schema.properties.find((p) => p.name === propertyName);
  if (!property) return null;

  if (property.type === "status") {
    return { [propertyName]: { status: { name: optionName } } };
  }
  if (property.type === "select") {
    return { [propertyName]: { select: { name: optionName } } };
  }
  return null;
}

async function updatePage(
  pageId: string,
  properties: PropertyPayload,
): Promise<MutationResult> {
  const client = getNotionClient();
  if (!client) return fail("Notion is not configured.");

  try {
    await withRetry(() => client.pages.update({ page_id: pageId, properties }));
    invalidateSnapshot();
    return OK;
  } catch (error) {
    return fail(describeNotionError(error));
  }
}

/** Change a media item's or an ad's status to one of its own options. */
export async function updateStatus(
  source: MediaSource | "ads",
  pageId: string,
  optionName: string,
): Promise<MutationResult> {
  if (isMockMode()) {
    mockUpdateStatus(pageId, optionName);
    return OK;
  }

  const { mapping, error } = await requireMapping();
  if (!mapping) return fail(error);

  const propertyName = mapping[source].status;
  if (!propertyName) {
    return fail(`No status property is mapped for ${source}. Check Setup.`);
  }

  try {
    const payload = await statusPayload(source, propertyName, optionName);
    if (!payload) {
      return fail(`"${propertyName}" is not a status or select property.`);
    }
    return await updatePage(pageId, payload);
  } catch (err) {
    return fail(describeNotionError(err));
  }
}

/** Change a media item's publish date. Pass null to clear it. */
export async function updatePublishDate(
  source: MediaSource,
  pageId: string,
  date: string | null,
): Promise<MutationResult> {
  if (isMockMode()) {
    mockUpdatePublishDate(pageId, date);
    return OK;
  }

  const { mapping, error } = await requireMapping();
  if (!mapping) return fail(error);

  const propertyName = mapping[source].publishDate;
  if (!propertyName) {
    return fail(`No publish date property is mapped for ${source}. Check Setup.`);
  }

  return updatePage(pageId, {
    [propertyName]: { date: date ? { start: date } : null },
  });
}

/** Change an ad's due date. Pass null to clear it. */
export async function updateAdDueDate(
  pageId: string,
  date: string | null,
): Promise<MutationResult> {
  if (isMockMode()) {
    mockUpdateDueDate(pageId, date);
    return OK;
  }

  const { mapping, error } = await requireMapping();
  if (!mapping) return fail(error);

  const propertyName = mapping.ads.dueDate;
  if (!propertyName) return fail("No due date property is mapped for ads.");

  return updatePage(pageId, {
    [propertyName]: { date: date ? { start: date } : null },
  });
}

/** Set who owns a media item. Pass an empty array to unassign everyone. */
export async function updateOwner(
  source: MediaSource,
  pageId: string,
  personIds: string[],
): Promise<MutationResult> {
  if (isMockMode()) {
    mockUpdateOwner(pageId, personIds);
    return OK;
  }

  const { mapping, error } = await requireMapping();
  if (!mapping) return fail(error);

  const propertyName = mapping[source].owner;
  if (!propertyName) {
    return fail(`No owner property is mapped for ${source}. Check Setup.`);
  }

  return updatePage(pageId, {
    [propertyName]: {
      people: personIds.map((id) => ({ object: "user" as const, id })),
    },
  });
}

/**
 * Place an ad on a piece of media, or clear its placement. Both placement
 * relations are written every time: setting one and emptying the other is
 * what keeps an ad from appearing to sit on two things at once.
 */
export async function placeAd(
  adId: string,
  target: { source: "content" | "shorts"; id: string } | null,
): Promise<MutationResult> {
  if (isMockMode()) {
    mockPlaceAd(adId, target);
    return OK;
  }

  const { mapping, error } = await requireMapping();
  if (!mapping) return fail(error);

  const contentProperty = mapping.ads.placementContent;
  const shortsProperty = mapping.ads.placementShorts;

  if (target?.source === "content" && !contentProperty) {
    return fail("No main-content placement relation is mapped for ads.");
  }
  if (target?.source === "shorts" && !shortsProperty) {
    return fail("No shorts placement relation is mapped for ads.");
  }
  if (!contentProperty && !shortsProperty) {
    return fail("No placement relation is mapped for ads. Check Setup.");
  }

  const properties: PropertyPayload = {};
  if (contentProperty) {
    properties[contentProperty] = {
      relation:
        target?.source === "content" ? [{ id: target.id }] : [],
    };
  }
  if (shortsProperty) {
    properties[shortsProperty] = {
      relation: target?.source === "shorts" ? [{ id: target.id }] : [],
    };
  }

  return updatePage(adId, properties);
}

/** Turn a Notion API error into something a teammate can act on. */
function describeNotionError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    const message =
      "message" in error ? String((error as { message: unknown }).message) : "";

    if (code === "validation_error") {
      return `Notion rejected the update: ${message}`;
    }
    if (code === "object_not_found") {
      return "Notion could not find that page. Check the integration has access to it.";
    }
    if (code === "unauthorized") {
      return "Notion rejected the token. Check NOTION_TOKEN and the integration's access.";
    }
    if (code === "restricted_resource") {
      return "The integration does not have write access to that database.";
    }
    return message || code;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
