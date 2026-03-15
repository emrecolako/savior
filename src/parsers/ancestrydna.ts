import { readFileSync } from "node:fs";
import type { InputFormat, ParsedGenome, RawGenotype } from "../types.js";

/**
 * Parse an AncestryDNA raw data file.
 *
 * Format:
 *   #AncestryDNA raw data download
 *   rsid \t chromosome \t position \t allele1 \t allele2
 *
 * Key difference from 23andMe: alleles are in separate columns.
 */
export function parseAncestryDNA(filePath: string): ParsedGenome {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);

  const metadata: Record<string, string> = {};
  const snps = new Map<string, RawGenotype>();
  let buildVersion = "GRCh37";

  for (const line of lines) {
    if (line.startsWith("#")) {
      if (line.includes("build 37")) buildVersion = "GRCh37";
      if (line.includes("build 38")) buildVersion = "GRCh38";
      if (line.includes("AncestryDNA")) metadata.source = "AncestryDNA";
      continue;
    }

    if (!line.trim()) continue;

    const parts = line.split("\t");
    if (parts.length < 5) continue;

    const [rsid, chromosome, posStr, allele1, allele2] = parts;
    const position = parseInt(posStr, 10);
    if (isNaN(position)) continue;

    // Combine alleles into a single genotype string
    const genotype = `${allele1.trim()}${allele2.trim()}`;

    // AncestryDNA uses "0" for no-calls
    if (genotype === "00") continue;

    snps.set(rsid, {
      rsid,
      chromosome,
      position,
      genotype,
    });
  }

  return {
    format: "ancestrydna" as InputFormat,
    buildVersion,
    totalSnps: snps.size,
    snps,
    metadata,
  };
}
