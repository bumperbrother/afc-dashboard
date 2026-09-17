"use server";

import {
  DATABASE_ENV_VARS,
  getConfigStatus,
  getDatabaseId,
  isMockMode,
  SOURCE_LABELS,
} from "@/lib/notion/client";
import { fetchSchema } from "@/lib/notion/query";
import { loadMapping, saveMapping, MAPPING_FILENAME } from "@/lib/mapping/load";
import {
  findMappingProblems,
  mappingSchema,
  type Mapping,
  type MappingProblem,
} from "@/lib/mapping/schema";
import {
  guessAdBucket,
  guessProperty,
  guessStatusBucket,
  sameId,
  type SchemaProperty,
} from "@/lib/mapping/heuristics";
import { invalidateSnapshot } from "@/lib/notion/store";
import {
  MOCK_DATABASE_IDS,
  MOCK_SCHEMAS,
} from "@/lib/notion/mock/fixtures";
import type { SourceKey } from "@/lib/types";

/**
 * Everything the setup page needs: the live schema of each database, a
 * suggested mapping, and whatever mapping is already saved.
 */

export interface DatabaseSchemaView {
  source: SourceKey;
  label: string;
  /** Null when the schema could not be read; `error` explains why. */
  title: string | null;
  databaseId: string | null;
  properties: SchemaProperty[];
  error: string | null;
}

export interface SetupState {
  isMock: boolean;
  hasToken: boolean;
  missingDatabases: SourceKey[];
  envVarNames: Record<SourceKey, string>;
  schemas: DatabaseSchemaView[];
  savedMapping: Mapping | null;
  mappingOrigin: "env" | "file" | "none";
  mappingError: string | null;
  suggested: Mapping | null;
  problems: MappingProblem[];
  /** True when the filesystem is writable, i.e. not a Vercel deployment. */
  canWriteFile: boolean;
  mappingFilename: string;
}

const SOURCES: SourceKey[] = [
  "content",
  "shorts",
  "clips",
  "ads",
  "companies",
];

export async function getSetupState(): Promise<SetupState> {
  const config = getConfigStatus();
  const { mapping, origin, error } = await loadMapping();

  const schemas: DatabaseSchemaView[] = await Promise.all(
    SOURCES.map(async (source) => {
      const databaseId = getDatabaseId(source);
      if (isMockMode()) {
        const schema = MOCK_SCHEMAS[source];
        return {
          source,
          label: SOURCE_LABELS[source],
          title: schema.title,
          databaseId: MOCK_DATABASE_IDS[source],
          properties: schema.properties,
          error:
            "Sample schema. Remove MOCK_NOTION and add a Notion token to map your real properties.",
        };
      }
      if (!databaseId) {
        return {
          source,
          label: SOURCE_LABELS[source],
          title: null,
          databaseId: null,
          properties: [],
          error: `${DATABASE_ENV_VARS[source]} is not set.`,
        };
      }
      try {
        const schema = await fetchSchema(source);
        return {
          source,
          label: SOURCE_LABELS[source],
          title: schema.title,
          databaseId: schema.databaseId,
          properties: schema.properties,
          error: null,
        };
      } catch (err) {
        return {
          source,
          label: SOURCE_LABELS[source],
          title: null,
          databaseId,
          properties: [],
          error: describe(err),
        };
      }
    }),
  );

  const suggested = buildSuggestedMapping(schemas);

  return {
    isMock: config.isMock,
    hasToken: config.hasToken,
    missingDatabases: config.missingDatabases,
    envVarNames: DATABASE_ENV_VARS,
    schemas,
    savedMapping: mapping,
    mappingOrigin: origin,
    mappingError: error,
    suggested,
    problems: mapping ? findMappingProblems(mapping) : [],
    canWriteFile: !process.env.VERCEL,
    mappingFilename: MAPPING_FILENAME,
  };
}

/** Guess a full mapping from the live schemas, for the "Auto-map" button. */
function buildSuggestedMapping(
  schemas: DatabaseSchemaView[],
): Mapping | null {
  const bySource = new Map(schemas.map((schema) => [schema.source, schema]));
  const content = bySource.get("content");
  const shorts = bySource.get("shorts");
  const clips = bySource.get("clips");
  const ads = bySource.get("ads");
  const companies = bySource.get("companies");

  if (!content || content.properties.length === 0) return null;

  const contentDbId = content.databaseId ?? undefined;
  const shortsDbId = shorts?.databaseId ?? undefined;
  const companiesDbId = companies?.databaseId ?? undefined;

  const mediaMapping = (
    schema: DatabaseSchemaView | undefined,
    parentTargetId?: string,
  ) => {
    const properties = schema?.properties ?? [];
    const statusProperty = guessProperty(properties, "status");
    const statusOptions =
      properties.find((p) => p.name === statusProperty)?.options ?? [];

    return {
      title: guessProperty(properties, "title") ?? "Name",
      status: statusProperty,
      publishDate: guessProperty(properties, "publishDate"),
      owner: guessProperty(properties, "owner"),
      url: guessProperty(properties, "url"),
      parent: parentTargetId
        ? guessProperty(properties, "parent", {
            relationTargets: { parent: parentTargetId },
          })
        : null,
      statusBuckets: Object.fromEntries(
        statusOptions.map((option) => [option.name, guessStatusBucket(option)]),
      ),
      defaultStatusBucket: "planned" as const,
    };
  };

  const adProperties = ads?.properties ?? [];
  const adStatusProperty = guessProperty(adProperties, "status");
  const adStatusOptions =
    adProperties.find((p) => p.name === adStatusProperty)?.options ?? [];

  const candidate = {
    version: 1 as const,
    content: {
      ...mediaMapping(content),
      channel: guessProperty(content.properties, "channel"),
    },
    shorts: mediaMapping(shorts, contentDbId),
    clips: mediaMapping(clips, contentDbId),
    ads: {
      title: guessProperty(adProperties, "title") ?? "Name",
      status: adStatusProperty,
      company: guessProperty(adProperties, "company", {
        relationTargets: { company: companiesDbId },
      }),
      placementContent: pickRelation(adProperties, contentDbId, [
        "content",
        "episode",
        "video",
        "newsletter",
      ]),
      placementShorts: pickRelation(adProperties, shortsDbId, ["short"]),
      dueDate: guessProperty(adProperties, "dueDate"),
      adType: guessProperty(adProperties, "adType"),
      notes: guessProperty(adProperties, "notes"),
      statusBuckets: Object.fromEntries(
        adStatusOptions.map((option) => [option.name, guessAdBucket(option)]),
      ),
      defaultStatusBucket: "owed" as const,
    },
    companies: {
      title: guessProperty(companies?.properties ?? [], "title") ?? "Name",
      status: guessProperty(companies?.properties ?? [], "status"),
      contact: guessProperty(companies?.properties ?? [], "contact"),
      url: guessProperty(companies?.properties ?? [], "url"),
    },
  };

  const parsed = mappingSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Prefer a relation that points at the expected database; fall back to the
 * name hints only when the target is unknown.
 */
function pickRelation(
  properties: SchemaProperty[],
  targetDatabaseId: string | undefined,
  hints: string[],
): string | null {
  const relations = properties.filter((p) => p.type === "relation");
  if (relations.length === 0) return null;

  if (targetDatabaseId) {
    const targeted = relations.filter(
      (p) => p.relationDatabaseId && sameId(p.relationDatabaseId, targetDatabaseId),
    );
    if (targeted.length === 1) return targeted[0].name;
    if (targeted.length > 1) {
      const byHint = targeted.find((p) =>
        hints.some((hint) => p.name.toLowerCase().includes(hint)),
      );
      return (byHint ?? targeted[0]).name;
    }
  }

  const byHint = relations.find((p) =>
    hints.some((hint) => p.name.toLowerCase().includes(hint)),
  );
  return byHint?.name ?? null;
}

export interface SaveResult {
  ok: boolean;
  error: string | null;
  /** When the file could not be written, the JSON to paste into an env var. */
  json: string | null;
  problems: MappingProblem[];
}

/** Validate and persist a mapping submitted from the setup form. */
export async function saveMappingAction(raw: unknown): Promise<SaveResult> {
  const parsed = mappingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      json: null,
      problems: [],
    };
  }

  const mapping = parsed.data;
  const json = JSON.stringify(mapping, null, 2);
  const problems = findMappingProblems(mapping);

  const result = await saveMapping(mapping);
  invalidateSnapshot();

  if (!result.ok) {
    return {
      ok: false,
      error: `Could not write ${MAPPING_FILENAME}: ${result.error}. Copy the JSON below into the DASHBOARD_MAPPING_JSON environment variable instead.`,
      json,
      problems,
    };
  }

  return { ok: true, error: null, json, problems };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
