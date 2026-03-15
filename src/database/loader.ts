import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SnpDatabase, SnpEntry } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default database path (shipped with the package) */
const DEFAULT_DB_PATH = join(__dirname, "../../data/snp-database.json");

/**
 * Load and optionally merge SNP databases.
 *
 * @param customPath - Path to a custom database JSON file
 * @param supplementary - Additional database files to merge
 */
export function loadDatabase(customPath?: string, supplementary?: string[]): SnpDatabase {
  const primaryPath = customPath ?? DEFAULT_DB_PATH;

  if (!existsSync(primaryPath)) {
    throw new Error(`SNP database not found at: ${primaryPath}`);
  }

  const primary: SnpDatabase = JSON.parse(readFileSync(primaryPath, "utf-8"));
  const allEntries = new Map<string, SnpEntry>();

  // Index primary entries
  for (const entry of primary.entries) {
    allEntries.set(entry.rsid, entry);
  }

  // Merge supplementary databases (later entries override earlier ones)
  if (supplementary) {
    for (const path of supplementary) {
      if (!existsSync(path)) {
        console.warn(`Supplementary database not found, skipping: ${path}`);
        continue;
      }
      const extra: SnpDatabase = JSON.parse(readFileSync(path, "utf-8"));
      for (const entry of extra.entries) {
        allEntries.set(entry.rsid, entry);
      }
    }
  }

  return {
    version: primary.version,
    lastUpdated: primary.lastUpdated,
    entries: Array.from(allEntries.values()),
  };
}

/**
 * Filter database entries by category and/or minimum severity.
 */
export function filterDatabase(
  db: SnpDatabase,
  options: {
    categories?: string[];
    minSeverity?: string;
  }
): SnpEntry[] {
  const severityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
    protective: 4,
    carrier: 5,
    informational: 6,
  };

  let entries = db.entries;

  if (options.categories?.length) {
    entries = entries.filter((e) => options.categories!.includes(e.category));
  }

  if (options.minSeverity) {
    const minRank = severityRank[options.minSeverity] ?? 6;
    entries = entries.filter((e) => (severityRank[e.severity] ?? 6) <= minRank);
  }

  return entries;
}
