import { promises as fs } from "node:fs";
import path from "node:path";
import { mappingSchema, type Mapping } from "./schema";

export const MAPPING_FILENAME = "dashboard.mapping.json";

function mappingPath(): string {
  return path.join(process.cwd(), MAPPING_FILENAME);
}

export interface LoadedMapping {
  mapping: Mapping | null;
  /** Where the mapping came from, for the setup page to explain itself. */
  origin: "env" | "file" | "none";
  /** Populated when a mapping exists but failed validation. */
  error: string | null;
}

/**
 * Load the property mapping. DASHBOARD_MAPPING_JSON wins, so a Vercel
 * deployment can carry its mapping in an env var; otherwise we read the
 * committed file. Never throws: the setup page has to render without one.
 */
export async function loadMapping(): Promise<LoadedMapping> {
  const fromEnv = process.env.DASHBOARD_MAPPING_JSON;
  if (fromEnv && fromEnv.trim() !== "") {
    try {
      const parsed = mappingSchema.parse(JSON.parse(fromEnv));
      return { mapping: parsed, origin: "env", error: null };
    } catch (error) {
      return {
        mapping: null,
        origin: "env",
        error: `DASHBOARD_MAPPING_JSON is set but invalid: ${describe(error)}`,
      };
    }
  }

  try {
    const raw = await fs.readFile(mappingPath(), "utf8");
    const parsed = mappingSchema.parse(JSON.parse(raw));
    return { mapping: parsed, origin: "file", error: null };
  } catch (error) {
    if (isNotFound(error)) {
      return { mapping: null, origin: "none", error: null };
    }
    return {
      mapping: null,
      origin: "file",
      error: `${MAPPING_FILENAME} could not be read: ${describe(error)}`,
    };
  }
}

/**
 * Write the mapping to disk. Works locally; on Vercel the filesystem is
 * read-only, so the caller falls back to showing JSON for the env var.
 */
export async function saveMapping(
  mapping: Mapping,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const validated = mappingSchema.parse(mapping);
    await fs.writeFile(
      mappingPath(),
      `${JSON.stringify(validated, null, 2)}\n`,
      "utf8",
    );
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
