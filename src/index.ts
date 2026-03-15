/**
 * genomic-report — Comprehensive personal genomic analysis toolkit.
 *
 * @example
 * ```ts
 * import { parseGenome, loadDatabase, analyse, generateReport } from "genomic-report";
 *
 * const genome = parseGenome("./my-23andme-data.txt");
 * const db = loadDatabase();
 * const result = analyse(genome, db);
 *
 * generateReport(result, {
 *   format: "markdown",
 *   outputPath: "./report.md",
 *   includeSummary: true,
 *   includeRawVariants: true,
 *   includePathways: true,
 *   includeActionItems: true,
 *   includeRecentLiterature: false,
 *   includeMethodology: true,
 *   subjectName: "Jane Doe",
 * });
 * ```
 */

// Parsers
export { parseGenome, detectFormat, parse23andMe, parseAncestryDNA } from "./parsers/index.js";

// Database
export { loadDatabase, filterDatabase } from "./database/loader.js";

// Analysis
export { analyse, crossReference, determineApoe, detectPathways, generateActionItems } from "./analysis/engine.js";

// Reports
export { generateReport, writeMarkdownReport, generateMarkdown, writeJsonReport } from "./reports/index.js";

// Types
export type * from "./types.js";
