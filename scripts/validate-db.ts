/**
 * Validate the SNP database for correctness and completeness.
 *
 * Usage: npx tsx scripts/validate-db.ts [path-to-db.json]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SnpDatabase, Severity, Category } from "../src/types.js";

const VALID_SEVERITIES: Severity[] = [
  "critical", "high", "moderate", "low", "protective", "carrier", "informational",
];

const VALID_CATEGORIES: Category[] = [
  "pharmacogenomics", "cardiovascular", "metabolic", "neurological", "autoimmune",
  "oncology", "nutrigenomic", "carrier", "ophthalmological", "hepatic", "renal",
  "pulmonary", "musculoskeletal", "hematological", "dermatological", "psychiatric",
  "reproductive", "longevity", "trait", "other",
];

const dbPath = process.argv[2] ?? resolve("data/snp-database.json");

console.log(`\n🔍 Validating: ${dbPath}\n`);

const db: SnpDatabase = JSON.parse(readFileSync(dbPath, "utf-8"));
let errors = 0;
let warnings = 0;
const seenRsids = new Set<string>();

for (let i = 0; i < db.entries.length; i++) {
  const e = db.entries[i];
  const loc = `Entry ${i} (${e.rsid})`;

  // Required fields
  if (!e.rsid) { console.error(`❌ ${loc}: missing rsid`); errors++; }
  if (!e.gene) { console.error(`❌ ${loc}: missing gene`); errors++; }
  if (!e.condition) { console.error(`❌ ${loc}: missing condition`); errors++; }
  if (!e.notes) { console.error(`❌ ${loc}: missing notes`); errors++; }

  // rsid format
  if (e.rsid && !e.rsid.startsWith("rs") && !e.rsid.startsWith("i")) {
    console.warn(`⚠️  ${loc}: rsid doesn't start with "rs" or "i": ${e.rsid}`);
    warnings++;
  }

  // Duplicates
  if (seenRsids.has(e.rsid)) {
    console.error(`❌ ${loc}: duplicate rsid`);
    errors++;
  }
  seenRsids.add(e.rsid);

  // Valid severity
  if (!VALID_SEVERITIES.includes(e.severity as Severity)) {
    console.error(`❌ ${loc}: invalid severity "${e.severity}"`);
    errors++;
  }

  // Valid category
  if (!VALID_CATEGORIES.includes(e.category as Category)) {
    console.error(`❌ ${loc}: invalid category "${e.category}"`);
    errors++;
  }

  // Risk allele should be a single character, "varies", or "N/A"
  if (e.riskAllele && e.riskAllele.length > 15) {
    console.warn(`⚠️  ${loc}: unusually long riskAllele: "${e.riskAllele}"`);
    warnings++;
  }

  // Evidence level present
  if (!e.evidenceLevel) {
    console.warn(`⚠️  ${loc}: missing evidenceLevel`);
    warnings++;
  }
}

// Summary
console.log(`\n${"─".repeat(50)}`);
console.log(`  Entries:  ${db.entries.length}`);
console.log(`  Version:  ${db.version}`);
console.log(`  Updated:  ${db.lastUpdated}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Warnings: ${warnings}`);
console.log(`${"─".repeat(50)}\n`);

if (errors > 0) {
  console.error("❌ Validation FAILED\n");
  process.exit(1);
} else {
  console.log("✅ Validation PASSED\n");
}
