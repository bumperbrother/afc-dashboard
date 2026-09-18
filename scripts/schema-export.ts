/**
 * Reads the structure of the five Notion databases and writes a file that
 * describes their shape: property names, types, options, relation targets,
 * row counts, and publish-date ranges.
 *
 * It deliberately reads no record content. Titles, notes, and every other
 * value stay in Notion. The output is safe to commit and safe to share.
 *
 *   npm run schema:export
 *
 * Needs NOTION_TOKEN and the five NOTION_DB_* variables, the same ones the
 * dashboard itself uses.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Client, LogLevel } from "@notionhq/client";
import type {
  DataSourceObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

const OUTPUT_FILE = "notion-schema.json";

const DATABASES: Array<{ key: SourceKey; label: string; envVar: string }> = [
  { key: "content", label: "Main content", envVar: "NOTION_DB_CONTENT" },
  { key: "shorts", label: "Shorts", envVar: "NOTION_DB_SHORTS" },
  { key: "clips", label: "Clips", envVar: "NOTION_DB_CLIPS" },
  { key: "ads", label: "Ads", envVar: "NOTION_DB_ADS" },
  { key: "companies", label: "Companies", envVar: "NOTION_DB_COMPANIES" },
];

type SourceKey = "content" | "shorts" | "clips" | "ads" | "companies";

interface PropertyReport {
  name: string;
  type: string;
  /** Select, multi-select, and status options, with their Notion colors. */
  options?: Array<{ name: string; color: string; group?: string }>;
  /** For relations: the database it points at, named when we recognise it. */
  relationTarget?: { databaseId: string; knownAs: string | null };
  /** How many rows have a value for this property. */
  filled?: number;
  /** For select and status properties: how many rows sit on each option. */
  optionCounts?: Record<string, number>;
  /** For date properties: the span of values present. */
  range?: { earliest: string; latest: string };
  /** For number properties: the span, so metric scales are obvious. */
  numericRange?: { min: number; max: number };
}

interface DatabaseReport {
  key: SourceKey;
  label: string;
  title: string;
  databaseId: string;
  dataSourceId: string;
  rowCount: number;
  properties: PropertyReport[];
  /** Populated for the ads database only. */
  relationCoverage?: Record<string, number>;
}

async function main(): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    fail(
      "NOTION_TOKEN is not set.\n\n" +
        "Create an internal integration at https://www.notion.so/my-integrations,\n" +
        "copy its token, and put it in .env.local as NOTION_TOKEN.",
    );
  }

  const missing = DATABASES.filter((db) => !process.env[db.envVar]);
  if (missing.length > 0) {
    fail(
      `These database ids are not set: ${missing.map((db) => db.envVar).join(", ")}.\n\n` +
        "Open each database in Notion as a full page. The id is the 32-character\n" +
        "string in the URL, before the ?v= part.",
    );
  }

  // The SDK default (2025-09-03) is required for the data-source endpoints.
  // The SDK logs its own warning on a failed request; ours says more, so keep
  // it quiet and let the message below do the explaining.
  const notion = new Client({ auth: token, logLevel: LogLevel.ERROR });
  const reports: DatabaseReport[] = [];

  for (const database of DATABASES) {
    const databaseId = process.env[database.envVar] as string;
    process.stdout.write(`Reading ${database.label}… `);
    try {
      reports.push(await describeDatabase(notion, database, databaseId));
      process.stdout.write("done\n");
    } catch (error) {
      process.stdout.write("failed\n");
      fail(
        `Could not read ${database.label} (${database.envVar}).\n\n` +
          `${describe(error)}\n\n` +
          "The usual cause is that the database has not been shared with the\n" +
          "integration. Open it in Notion, then ••• -> Connections -> add your\n" +
          "integration, and run this again.",
      );
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    note: "Structure only. No record content is included in this file.",
    databases: reports,
  };

  const outputPath = path.join(process.cwd(), OUTPUT_FILE);
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  printSummary(reports);
  console.log(`\nWritten to ${OUTPUT_FILE}. It contains no record content, so it is safe to share.`);
}

async function describeDatabase(
  notion: Client,
  database: { key: SourceKey; label: string },
  databaseId: string,
): Promise<DatabaseReport> {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  if (!("data_sources" in db) || db.data_sources.length === 0) {
    throw new Error("This database has no readable data source.");
  }
  const dataSourceId = db.data_sources[0].id;

  const schema = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  if (!("title" in schema)) {
    throw new Error("The integration cannot read this database's properties.");
  }

  const rows = await fetchAllRows(notion, dataSourceId);
  const properties = describeProperties(schema, rows);

  const report: DatabaseReport = {
    key: database.key,
    label: database.label,
    title: schema.title.map((part) => part.plain_text).join("") || database.label,
    databaseId,
    dataSourceId,
    rowCount: rows.length,
    properties,
  };

  if (database.key === "ads") {
    report.relationCoverage = describeAdCoverage(schema, rows);
  }

  return report;
}

/** Every row, following pagination. Only property *shapes* are inspected. */
async function fetchAllRows(
  notion: Client,
  dataSourceId: string,
): Promise<PageObjectResponse[]> {
  const rows: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      start_cursor: cursor,
    });
    for (const result of response.results) {
      if (result.object === "page" && "properties" in result) {
        rows.push(result as PageObjectResponse);
      }
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return rows;
}

const KNOWN_DATABASES = (): Record<string, string> => {
  const known: Record<string, string> = {};
  for (const database of DATABASES) {
    const id = process.env[database.envVar];
    if (id) known[id.replace(/-/g, "").toLowerCase()] = database.label;
  }
  return known;
};

function describeProperties(
  schema: DataSourceObjectResponse,
  rows: PageObjectResponse[],
): PropertyReport[] {
  const known = KNOWN_DATABASES();
  const reports: PropertyReport[] = [];

  for (const config of Object.values(schema.properties)) {
    const report: PropertyReport = { name: config.name, type: config.type };

    if (config.type === "select") {
      report.options = config.select.options.map((o) => ({
        name: o.name,
        color: o.color,
      }));
    } else if (config.type === "multi_select") {
      report.options = config.multi_select.options.map((o) => ({
        name: o.name,
        color: o.color,
      }));
    } else if (config.type === "status") {
      const groupOf = new Map<string, string>();
      for (const group of config.status.groups) {
        for (const id of group.option_ids) groupOf.set(id, group.name);
      }
      report.options = config.status.options.map((o) => ({
        name: o.name,
        color: o.color,
        group: groupOf.get(o.id),
      }));
    } else if (config.type === "relation") {
      const target = config.relation.database_id;
      report.relationTarget = {
        databaseId: target,
        knownAs: known[target.replace(/-/g, "").toLowerCase()] ?? null,
      };
    }

    applyValueStats(report, config.name, rows);
    reports.push(report);
  }

  reports.sort((a, b) => a.name.localeCompare(b.name));
  return reports;
}

/**
 * Counts and ranges only. This reads which option a row sits on and whether a
 * field has a value; it never reads text, titles, or notes.
 */
function applyValueStats(
  report: PropertyReport,
  propertyName: string,
  rows: PageObjectResponse[],
): void {
  let filled = 0;
  const optionCounts: Record<string, number> = {};
  const dates: string[] = [];
  const numbers: number[] = [];

  for (const row of rows) {
    const value = row.properties[propertyName];
    if (!value) continue;

    switch (value.type) {
      case "select":
        if (value.select) {
          filled++;
          optionCounts[value.select.name] = (optionCounts[value.select.name] ?? 0) + 1;
        }
        break;
      case "status":
        if (value.status) {
          filled++;
          optionCounts[value.status.name] = (optionCounts[value.status.name] ?? 0) + 1;
        }
        break;
      case "multi_select":
        if (value.multi_select.length > 0) {
          filled++;
          for (const option of value.multi_select) {
            optionCounts[option.name] = (optionCounts[option.name] ?? 0) + 1;
          }
        }
        break;
      case "date":
        if (value.date?.start) {
          filled++;
          dates.push(value.date.start);
        }
        break;
      case "number":
        if (value.number !== null) {
          filled++;
          numbers.push(value.number);
        }
        break;
      case "people":
        if (value.people.length > 0) filled++;
        break;
      case "relation":
        if (value.relation.length > 0) filled++;
        break;
      case "title":
        if (value.title.length > 0) filled++;
        break;
      case "rich_text":
        if (value.rich_text.length > 0) filled++;
        break;
      case "url":
        if (value.url) filled++;
        break;
      case "email":
        if (value.email) filled++;
        break;
      case "checkbox":
        if (value.checkbox) filled++;
        break;
      default:
        break;
    }
  }

  report.filled = filled;
  if (Object.keys(optionCounts).length > 0) report.optionCounts = optionCounts;
  if (dates.length > 0) {
    dates.sort();
    report.range = { earliest: dates[0], latest: dates[dates.length - 1] };
  }
  if (numbers.length > 0) {
    report.numericRange = {
      min: Math.min(...numbers),
      max: Math.max(...numbers),
    };
  }
}

/** For the ads database: how many ads use each relation, and how many none. */
function describeAdCoverage(
  schema: DataSourceObjectResponse,
  rows: PageObjectResponse[],
): Record<string, number> {
  const relationNames = Object.values(schema.properties)
    .filter((config) => config.type === "relation")
    .map((config) => config.name);

  const coverage: Record<string, number> = {};
  for (const name of relationNames) coverage[name] = 0;

  let withoutAnyRelation = 0;
  for (const row of rows) {
    let any = false;
    for (const name of relationNames) {
      const value = row.properties[name];
      if (value?.type === "relation" && value.relation.length > 0) {
        coverage[name] += 1;
        any = true;
      }
    }
    if (!any) withoutAnyRelation += 1;
  }

  coverage["(no relation set)"] = withoutAnyRelation;
  return coverage;
}

function printSummary(reports: DatabaseReport[]): void {
  console.log("\n─────────────────────────────────────────────");
  for (const report of reports) {
    console.log(`\n${report.label}: "${report.title}" — ${report.rowCount} rows`);

    for (const property of report.properties) {
      const bits: string[] = [property.type];
      if (property.filled !== undefined && report.rowCount > 0) {
        bits.push(`${property.filled}/${report.rowCount} filled`);
      }
      if (property.options) bits.push(`${property.options.length} options`);
      if (property.relationTarget) {
        bits.push(`-> ${property.relationTarget.knownAs ?? "an unlisted database"}`);
      }
      if (property.range) {
        bits.push(`${property.range.earliest.slice(0, 10)} to ${property.range.latest.slice(0, 10)}`);
      }
      console.log(`  ${property.name.padEnd(28)} ${bits.join(", ")}`);
    }

    if (report.relationCoverage) {
      console.log("  placement coverage:");
      for (const [name, count] of Object.entries(report.relationCoverage)) {
        console.log(`    ${name.padEnd(26)} ${count}`);
      }
    }
  }
  console.log("\n─────────────────────────────────────────────");
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  fail(describe(error));
});
