/**
 * Print statistics about the SNP database.
 *
 * Usage: npx tsx scripts/db-stats.ts [path-to-db.json]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SnpDatabase } from "../src/types.js";

const dbPath = process.argv[2] ?? resolve("data/snp-database.json");
const db: SnpDatabase = JSON.parse(readFileSync(dbPath, "utf-8"));

console.log(`\n🧬 SNP Database Statistics`);
console.log(`${"─".repeat(50)}`);
console.log(`  Version:     ${db.version}`);
console.log(`  Last updated: ${db.lastUpdated}`);
console.log(`  Total entries: ${db.entries.length}`);
console.log(`${"─".repeat(50)}`);

// By category
const cats = new Map<string, number>();
for (const e of db.entries) cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
console.log(`\n  By category:`);
for (const [cat, n] of [...cats.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${cat.padEnd(22)} ${String(n).padStart(4)}  ${"█".repeat(Math.ceil(n / 2))}`);
}

// By severity
const sevs = new Map<string, number>();
for (const e of db.entries) sevs.set(e.severity, (sevs.get(e.severity) ?? 0) + 1);
console.log(`\n  By severity:`);
for (const [sev, n] of [...sevs.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${sev.padEnd(22)} ${String(n).padStart(4)}  ${"█".repeat(Math.ceil(n / 2))}`);
}

// Top genes
const genes = new Map<string, number>();
for (const e of db.entries) genes.set(e.gene, (genes.get(e.gene) ?? 0) + 1);
const topGenes = [...genes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`\n  Top genes (by variant count):`);
for (const [gene, n] of topGenes) {
  console.log(`    ${gene.padEnd(22)} ${String(n).padStart(4)}`);
}

console.log("");
