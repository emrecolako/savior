#!/usr/bin/env npx tsx
/**
 * curate-pgs.ts — Transform raw PGS Catalog scoring files into our .pgs.json format.
 *
 * Usage:
 *   npx tsx scripts/curate-pgs.ts \
 *     --input PGS000018.txt.gz \
 *     --trait-id cad \
 *     --trait-name "Coronary Artery Disease" \
 *     --pgs-id PGS000018 \
 *     --pop-mean 3.45 \
 *     --pop-sd 1.12 \
 *     --pop-source "UK Biobank" \
 *     --pop-ancestry EUR \
 *     --pop-n 408000 \
 *     --top-n 1500 \
 *     --output data/pgs/cad.pgs.json
 *
 * Input format: PGS Catalog scoring file (TSV, optionally gzipped).
 * Expected columns: rsID, effect_allele, other_allele, effect_weight,
 *                   chr_name, chr_position (column order may vary).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PgsScoringFile, PgsVariantWeight } from "../src/types.js";

// ── Argument parsing (minimal, no dependency) ──

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--") && i + 1 < argv.length) {
      args[key.slice(2)] = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const required = ["input", "trait-id", "trait-name", "pgs-id", "pop-mean", "pop-sd", "pop-source", "pop-ancestry", "pop-n"];
for (const key of required) {
  if (!args[key]) {
    console.error(`Missing required argument: --${key}`);
    process.exit(1);
  }
}

const inputPath = resolve(args["input"]);
const outputPath = resolve(args["output"] ?? `data/pgs/${args["trait-id"]}.pgs.json`);
const topN = parseInt(args["top-n"] ?? "1500", 10);

// ── Read and parse input file ──

let rawContent: string;
if (inputPath.endsWith(".gz")) {
  const { execSync } = await import("node:child_process");
  rawContent = execSync(`gunzip -c "${inputPath}"`, { encoding: "utf-8" });
} else {
  rawContent = readFileSync(inputPath, "utf-8");
}

const lines = rawContent.split("\n").filter((l) => l.trim() && !l.startsWith("#"));

// Detect header
const headerLine = lines[0];
const headers = headerLine.split("\t").map((h) => h.trim().toLowerCase());

const colMap: Record<string, number> = {};
for (const [i, h] of headers.entries()) {
  if (h === "rsid" || h === "snp_id" || h === "rsid") colMap["rsid"] = i;
  if (h === "effect_allele" || h === "allele1") colMap["effectAllele"] = i;
  if (h === "other_allele" || h === "allele2" || h === "reference_allele") colMap["otherAllele"] = i;
  if (h === "effect_weight" || h === "beta" || h === "weight") colMap["effectWeight"] = i;
  if (h === "chr_name" || h === "chr" || h === "chromosome") colMap["chr"] = i;
  if (h === "chr_position" || h === "bp" || h === "pos" || h === "position") colMap["pos"] = i;
}

const requiredCols = ["rsid", "effectAllele", "otherAllele", "effectWeight"];
for (const col of requiredCols) {
  if (colMap[col] === undefined) {
    console.error(`Could not find column for '${col}' in header: ${headerLine}`);
    process.exit(1);
  }
}

// Parse variants
const allVariants: PgsVariantWeight[] = [];
const validBases = new Set(["A", "T", "C", "G"]);

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split("\t");
  const rsid = cols[colMap["rsid"]]?.trim();
  const effectAllele = cols[colMap["effectAllele"]]?.trim().toUpperCase();
  const otherAllele = cols[colMap["otherAllele"]]?.trim().toUpperCase();
  const effectWeight = parseFloat(cols[colMap["effectWeight"]]);
  const chr = cols[colMap["chr"]]?.trim() ?? "";
  const pos = parseInt(cols[colMap["pos"]] ?? "0", 10);

  // Skip invalid entries
  if (!rsid || !rsid.startsWith("rs")) continue;
  if (!validBases.has(effectAllele) || !validBases.has(otherAllele)) continue;
  if (!isFinite(effectWeight)) continue;

  allVariants.push({ rsid, effectAllele, otherAllele, effectWeight, chr, pos });
}

console.log(`Parsed ${allVariants.length} valid variants from ${inputPath}`);

// Sort by absolute effect weight (descending) and take top N
allVariants.sort((a, b) => Math.abs(b.effectWeight) - Math.abs(a.effectWeight));
const curated = allVariants.slice(0, topN);

console.log(`Selected top ${curated.length} variants by absolute effect weight`);

// ── Build output ──

const output: PgsScoringFile = {
  pgsId: args["pgs-id"],
  traitName: args["trait-name"],
  traitId: args["trait-id"],
  publicationPmid: args["pmid"],
  genomeBuild: args["build"] ?? "GRCh37",
  totalVariantsOriginal: allVariants.length,
  totalVariantsCurated: curated.length,
  populationParams: {
    source: args["pop-source"],
    ancestry: args["pop-ancestry"],
    mean: parseFloat(args["pop-mean"]),
    sd: parseFloat(args["pop-sd"]),
    sampleSize: parseInt(args["pop-n"], 10),
  },
  variants: curated,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
console.log(`Wrote ${outputPath}`);
