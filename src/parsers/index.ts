import { readFileSync } from "node:fs";
import type { InputFormat, ParsedGenome } from "../types.js";
import { parse23andMe } from "./twentythree-and-me.js";
import { parseAncestryDNA } from "./ancestrydna.js";

/**
 * Auto-detect file format by reading the first few lines.
 */
export function detectFormat(filePath: string): InputFormat {
  const head = readFileSync(filePath, "utf-8").slice(0, 2000);

  if (head.includes("23andMe")) return "23andme";
  if (head.includes("AncestryDNA")) return "ancestrydna";
  if (head.startsWith("##fileformat=VCF")) return "vcf";

  // Fallback: count tab-separated columns in first data line
  const dataLine = head.split(/\r?\n/).find((l) => !l.startsWith("#") && l.trim());
  if (dataLine) {
    const cols = dataLine.split("\t").length;
    if (cols === 4) return "23andme"; // rsid, chr, pos, genotype
    if (cols >= 5) return "ancestrydna"; // rsid, chr, pos, a1, a2
  }

  return "generic-tsv";
}

/**
 * Parse a genome file, auto-detecting format if not specified.
 */
export function parseGenome(filePath: string, format?: InputFormat): ParsedGenome {
  const detected = format ?? detectFormat(filePath);

  switch (detected) {
    case "23andme":
      return parse23andMe(filePath);
    case "ancestrydna":
      return parseAncestryDNA(filePath);
    case "vcf":
      throw new Error("VCF parser not yet implemented. Contributions welcome!");
    case "generic-tsv":
      // Try 23andMe format as fallback
      return parse23andMe(filePath);
    default:
      throw new Error(`Unknown format: ${detected}`);
  }
}

export { parse23andMe } from "./twentythree-and-me.js";
export { parseAncestryDNA } from "./ancestrydna.js";
