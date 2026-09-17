import { Client } from "@notionhq/client";
import type { SourceKey } from "@/lib/types";

/** Env var holding each database id. */
export const DATABASE_ENV_VARS: Record<SourceKey, string> = {
  content: "NOTION_DB_CONTENT",
  shorts: "NOTION_DB_SHORTS",
  clips: "NOTION_DB_CLIPS",
  ads: "NOTION_DB_ADS",
  companies: "NOTION_DB_COMPANIES",
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  content: "Main content",
  shorts: "Shorts",
  clips: "Clips",
  ads: "Ads",
  companies: "Companies",
};

/** True when the app is running against bundled fixtures. */
export function isMockMode(): boolean {
  return process.env.MOCK_NOTION === "1";
}

let cached: Client | null = null;

/** The Notion client, or null when no token is configured. */
export function getNotionClient(): Client | null {
  if (isMockMode()) return null;
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  if (!cached) {
    // The SDK default (2025-09-03) is required for the data-source endpoints.
    cached = new Client({ auth: token });
  }
  return cached;
}

/** The configured database id for a source, or null when unset. */
export function getDatabaseId(source: SourceKey): string | null {
  const value = process.env[DATABASE_ENV_VARS[source]];
  return value && value.trim() !== "" ? value.trim() : null;
}

export interface ConfigStatus {
  hasToken: boolean;
  missingDatabases: SourceKey[];
  isMock: boolean;
  /** True when we can talk to Notion at all. */
  ready: boolean;
}

/** What is and is not configured, for the setup page and error states. */
export function getConfigStatus(): ConfigStatus {
  if (isMockMode()) {
    return { hasToken: true, missingDatabases: [], isMock: true, ready: true };
  }
  const hasToken = Boolean(process.env.NOTION_TOKEN);
  const missingDatabases = (Object.keys(DATABASE_ENV_VARS) as SourceKey[]).filter(
    (source) => !getDatabaseId(source),
  );
  return {
    hasToken,
    missingDatabases,
    isMock: false,
    ready: hasToken && missingDatabases.length === 0,
  };
}
