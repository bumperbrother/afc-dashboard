import { z } from "zod";
import type { AdBucket, StatusBucket } from "@/lib/types";

/**
 * The property mapping tells the dashboard which Notion property plays which
 * role in each database, and how each status option maps to a dashboard
 * bucket. It is produced by the /setup page and validated here.
 */

const propertyName = z.string().min(1);

/** option name (as it reads in Notion) -> dashboard bucket */
const statusBucketMap = z.record(
  z.string(),
  z.enum(["planned", "inProgress", "scheduled", "published", "cancelled"]),
);

const adBucketMap = z.record(
  z.string(),
  z.enum(["owed", "placed", "published", "cancelled"]),
);

/** Shared shape for the three media databases. */
const mediaMappingBase = z.object({
  /** Notion title property. */
  title: propertyName,
  /** Select or status property holding production status. */
  status: propertyName.nullable().default(null),
  /** Date property holding the publish/air date. */
  publishDate: propertyName.nullable().default(null),
  /** People property holding the owner(s). */
  owner: propertyName.nullable().default(null),
  /** URL property linking to the published piece. */
  url: propertyName.nullable().default(null),
  /** How each status option maps onto a dashboard bucket. */
  statusBuckets: statusBucketMap.default({}),
  /** Bucket used for any status option not listed above. */
  defaultStatusBucket: z
    .enum(["planned", "inProgress", "scheduled", "published", "cancelled"])
    .default("planned"),
});

export const contentMappingSchema = mediaMappingBase.extend({
  /** Select or multi-select distinguishing newsletter / podcast / YouTube. */
  channel: propertyName.nullable().default(null),
});

export const shortsMappingSchema = mediaMappingBase.extend({
  /** Relation back to the main-content item this was cut from. */
  parent: propertyName.nullable().default(null),
});

export const clipsMappingSchema = mediaMappingBase.extend({
  parent: propertyName.nullable().default(null),
});

export const adsMappingSchema = z.object({
  title: propertyName,
  status: propertyName.nullable().default(null),
  /** Relation to the companies database. */
  company: propertyName.nullable().default(null),
  /** Relation to the main-content database. */
  placementContent: propertyName.nullable().default(null),
  /** Relation to the shorts database. Clips never carry ads. */
  placementShorts: propertyName.nullable().default(null),
  dueDate: propertyName.nullable().default(null),
  /** Select describing the ad format, e.g. "Mid-roll", "Newsletter primary". */
  adType: propertyName.nullable().default(null),
  notes: propertyName.nullable().default(null),
  statusBuckets: adBucketMap.default({}),
  defaultStatusBucket: z
    .enum(["owed", "placed", "published", "cancelled"])
    .default("owed"),
});

export const companiesMappingSchema = z.object({
  title: propertyName,
  status: propertyName.nullable().default(null),
  contact: propertyName.nullable().default(null),
  url: propertyName.nullable().default(null),
});

export const mappingSchema = z.object({
  /** Bumped if the mapping shape ever changes incompatibly. */
  version: z.literal(1).default(1),
  content: contentMappingSchema,
  shorts: shortsMappingSchema,
  clips: clipsMappingSchema,
  ads: adsMappingSchema,
  companies: companiesMappingSchema,
});

export type ContentMapping = z.infer<typeof contentMappingSchema>;
export type ShortsMapping = z.infer<typeof shortsMappingSchema>;
export type ClipsMapping = z.infer<typeof clipsMappingSchema>;
export type AdsMapping = z.infer<typeof adsMappingSchema>;
export type CompaniesMapping = z.infer<typeof companiesMappingSchema>;
export type Mapping = z.infer<typeof mappingSchema>;
export type MediaMapping = ContentMapping | ShortsMapping | ClipsMapping;

/** Roles the dashboard needs in order to render its day-one views. */
export const REQUIRED_ROLES: Record<string, string[]> = {
  content: ["title", "status", "publishDate"],
  shorts: ["title", "status", "publishDate"],
  clips: ["title", "publishDate"],
  ads: ["title", "status", "company"],
  companies: ["title"],
};

export interface MappingProblem {
  database: string;
  role: string;
  severity: "error" | "warning";
  message: string;
}

/**
 * Report roles that are unset. Missing required roles are errors (the related
 * view will be empty or broken); missing optional roles are warnings.
 */
export function findMappingProblems(mapping: Mapping): MappingProblem[] {
  const problems: MappingProblem[] = [];
  const databases: Array<[string, Record<string, unknown>]> = [
    ["content", mapping.content],
    ["shorts", mapping.shorts],
    ["clips", mapping.clips],
    ["ads", mapping.ads],
    ["companies", mapping.companies],
  ];

  for (const [database, config] of databases) {
    const required = REQUIRED_ROLES[database] ?? [];
    for (const [role, value] of Object.entries(config)) {
      if (role === "statusBuckets" || role === "defaultStatusBucket") continue;
      if (value !== null && value !== undefined && value !== "") continue;
      const isRequired = required.includes(role);
      problems.push({
        database,
        role,
        severity: isRequired ? "error" : "warning",
        message: isRequired
          ? `"${role}" is not mapped. Views that rely on it will be incomplete.`
          : `"${role}" is not mapped. That is fine, the field is optional.`,
      });
    }
  }

  if (!mapping.ads.placementContent && !mapping.ads.placementShorts) {
    problems.push({
      database: "ads",
      role: "placement",
      severity: "error",
      message:
        "Neither placement relation is mapped, so the ad tracker cannot tell which ads are placed.",
    });
  }

  return problems;
}

/** True when nothing is missing that would break a day-one view. */
export function isMappingUsable(mapping: Mapping): boolean {
  return !findMappingProblems(mapping).some((p) => p.severity === "error");
}

/** Resolve a status option name to its bucket, falling back to the default. */
export function bucketForStatus(
  optionName: string | null,
  buckets: Record<string, StatusBucket>,
  fallback: StatusBucket,
): StatusBucket {
  if (!optionName) return fallback;
  return buckets[optionName] ?? fallback;
}

/** Same, for the ad lifecycle buckets. */
export function adBucketForStatus(
  optionName: string | null,
  buckets: Record<string, AdBucket>,
  fallback: AdBucket,
): AdBucket {
  if (!optionName) return fallback;
  return buckets[optionName] ?? fallback;
}
