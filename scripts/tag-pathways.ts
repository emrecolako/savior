#!/usr/bin/env npx tsx
/**
 * Tag SNP database entries with pathway membership tags.
 *
 * Reads data/snp-database.json, matches each entry against pathway definitions
 * using gene patterns, keywords, and categories, then adds "pathway:<slug>" tags.
 *
 * Usage: npx tsx scripts/tag-pathways.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PATHWAY_DEFINITIONS } from "../src/analysis/pathways.js";
import type { SnpEntry, SnpDatabase } from "../src/types.js";

const DB_PATH = resolve(import.meta.dirname ?? __dirname, "../data/snp-database.json");

function matchesPathway(entry: SnpEntry, def: typeof PATHWAY_DEFINITIONS[number]): boolean {
  const condLower = entry.condition.toLowerCase();
  const geneLower = entry.gene.toLowerCase();

  const matchesKeyword = def.keywords.some((k) => condLower.includes(k));
  const matchesGene = def.genePatterns.some(
    (p) => entry.gene.startsWith(p) || geneLower.includes(p.toLowerCase())
  );
  const matchesCategory = def.categories.includes(entry.category as any);

  return matchesKeyword || matchesGene || matchesCategory;
}

function main() {
  const raw = readFileSync(DB_PATH, "utf-8");
  const db: SnpDatabase = JSON.parse(raw);

  let totalTagsAdded = 0;
  const pathwayCounts: Record<string, number> = {};

  for (const entry of db.entries) {
    // Preserve existing non-pathway tags
    const existingTags = (entry.tags ?? []).filter((t) => !t.startsWith("pathway:"));
    const pathwayTags: string[] = [];

    for (const def of PATHWAY_DEFINITIONS) {
      if (matchesPathway(entry, def)) {
        pathwayTags.push(`pathway:${def.slug}`);
        pathwayCounts[def.slug] = (pathwayCounts[def.slug] ?? 0) + 1;
      }
    }

    entry.tags = [...existingTags, ...pathwayTags];
    if (pathwayTags.length === 0) {
      // Keep tags field if it had existing tags, otherwise remove empty array
      if (existingTags.length === 0) delete entry.tags;
    }
    totalTagsAdded += pathwayTags.length;
  }

  writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf-8");

  console.log(`Tagged ${db.entries.length} entries. ${totalTagsAdded} pathway tags added.\n`);
  console.log("Pathway distribution:");
  const sorted = Object.entries(pathwayCounts).sort((a, b) => b[1] - a[1]);
  for (const [slug, count] of sorted) {
    console.log(`  ${slug}: ${count}`);
  }
  const untagged = db.entries.filter((e) => !(e.tags ?? []).some((t) => t.startsWith("pathway:"))).length;
  console.log(`\nUntagged entries: ${untagged}`);
}

main();
