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
export { buildDrugGeneMatrix } from "./analysis/metabolizers.js";

// PRS
export { computePrs, computeAllPrs, normalCdf, complementBase, countEffectAlleles, categorizePercentile } from "./analysis/prs-engine.js";
export { loadPgsIndex, loadPgsScoringFile, loadAllPgsScoringFiles } from "./database/pgs-loader.js";

// Reports
export { generateReport, writeMarkdownReport, generateMarkdown, writeJsonReport, writeGpCard, writeGpCardJsonFile, generateGpCardMarkdown, generateGpCardJson } from "./reports/index.js";

// Research
export {
  enrichWithResearch,
  generateResearchSummary,
  scoreRelevance,
  extractAbstractFromXml,
  classifyEvidenceDirection,
  annotateEvidenceDirection,
  searchClinicalTrials,
  variantResearchBrief,
  createResearchConfig,
  prioritizeForResearch,
  researchLandscapeOverview,
  findResearchGaps,
  saveResearchFindings,
  loadResearchFindings,
  RateLimiter,
  PubMedProvider,
  ExaProvider,
  FallbackProvider,
  setSleep,
  resetSleep,
} from "./research/index.js";
export type { ClinicalTrial } from "./research/index.js";
export type { ResearchProviderImpl } from "./research/index.js";

// Types
export type * from "./types.js";
