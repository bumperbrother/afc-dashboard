import type { Client } from "@notionhq/client";
import type {
  DataSourceObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import type { SchemaProperty } from "@/lib/mapping/heuristics";
import type { SourceKey } from "@/lib/types";
import { getDatabaseId, getNotionClient, SOURCE_LABELS } from "./client";

/**
 * Notion's 2025-09-03 API puts rows on a *data source* rather than the
 * database itself. A database can hold several; the dashboard uses the first,
 * which is what every database created through the UI has exactly one of.
 */

const dataSourceIdCache = new Map<string, string>();

/** Resolve a database id to its primary data source id, with caching. */
export async function getPrimaryDataSourceId(
  client: Client,
  databaseId: string,
): Promise<string> {
  const cached = dataSourceIdCache.get(databaseId);
  if (cached) return cached;

  const database = await client.databases.retrieve({ database_id: databaseId });
  if (!("data_sources" in database) || database.data_sources.length === 0) {
    throw new Error(
      `Database ${databaseId} has no data sources. Check that the integration has access to it.`,
    );
  }
  const id = database.data_sources[0].id;
  dataSourceIdCache.set(databaseId, id);
  return id;
}

/** A data source's schema, reduced to what the setup page needs. */
export interface DataSourceSchema {
  source: SourceKey;
  databaseId: string;
  dataSourceId: string;
  title: string;
  properties: SchemaProperty[];
}

/** Read one database's schema so the setup page can offer its properties. */
export async function fetchSchema(source: SourceKey): Promise<DataSourceSchema> {
  const client = getNotionClient();
  if (!client) throw new Error("Notion is not configured (no NOTION_TOKEN).");

  const databaseId = getDatabaseId(source);
  if (!databaseId) {
    throw new Error(`No database id configured for ${SOURCE_LABELS[source]}.`);
  }

  const dataSourceId = await getPrimaryDataSourceId(client, databaseId);
  const response = await client.dataSources.retrieve({
    data_source_id: dataSourceId,
  });

  // A partial response means the integration can see the data source but not
  // read its schema, which is nearly always a missing connection in Notion.
  if (!("title" in response)) {
    throw new Error(
      `${SOURCE_LABELS[source]}: the integration cannot read this database's properties. Share the database with the integration in Notion.`,
    );
  }
  const dataSource: DataSourceObjectResponse = response;

  return {
    source,
    databaseId,
    dataSourceId,
    title: plainTitle(dataSource) || SOURCE_LABELS[source],
    properties: toSchemaProperties(dataSource),
  };
}

function plainTitle(dataSource: DataSourceObjectResponse): string {
  if (!("title" in dataSource) || !Array.isArray(dataSource.title)) return "";
  return dataSource.title.map((part) => part.plain_text).join("");
}

/** Flatten Notion's property config union into the shape heuristics expect. */
export function toSchemaProperties(
  dataSource: DataSourceObjectResponse,
): SchemaProperty[] {
  const properties: SchemaProperty[] = [];

  for (const config of Object.values(dataSource.properties)) {
    const property: SchemaProperty = { name: config.name, type: config.type };

    if (config.type === "select") {
      property.options = config.select.options.map((option) => ({
        name: option.name,
        color: option.color,
      }));
    } else if (config.type === "multi_select") {
      property.options = config.multi_select.options.map((option) => ({
        name: option.name,
        color: option.color,
      }));
    } else if (config.type === "status") {
      const groupByOptionId = new Map<string, string>();
      for (const group of config.status.groups) {
        for (const optionId of group.option_ids) {
          groupByOptionId.set(optionId, group.name);
        }
      }
      property.options = config.status.options.map((option) => ({
        name: option.name,
        color: option.color,
        groupName: groupByOptionId.get(option.id),
      }));
    } else if (config.type === "relation") {
      property.relationDatabaseId = config.relation.database_id;
    }

    properties.push(property);
  }

  properties.sort((a, b) => a.name.localeCompare(b.name));
  return properties;
}

/** Fetch every row of a database, following pagination to the end. */
export async function fetchAllRows(
  source: SourceKey,
): Promise<PageObjectResponse[]> {
  const client = getNotionClient();
  if (!client) throw new Error("Notion is not configured (no NOTION_TOKEN).");

  const databaseId = getDatabaseId(source);
  if (!databaseId) {
    throw new Error(`No database id configured for ${SOURCE_LABELS[source]}.`);
  }

  const dataSourceId = await getPrimaryDataSourceId(client, databaseId);
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.dataSources.query({
        data_source_id: dataSourceId,
        page_size: 100,
        start_cursor: cursor,
      }),
    );

    for (const result of response.results) {
      // Partial results appear when the integration lacks read access to a
      // row; there is nothing useful to show for those, so skip them.
      if (result.object === "page" && "properties" in result) {
        pages.push(result as PageObjectResponse);
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

/**
 * Retry on Notion's rate limit and transient errors, backing off between
 * attempts. The SDK retries some of this itself; this covers the rest.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      const delayMs = 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  const status = "status" in error ? Number(error.status) : 0;
  return (
    code === "rate_limited" ||
    code === "service_unavailable" ||
    code === "internal_server_error" ||
    status === 429 ||
    status >= 500
  );
}
