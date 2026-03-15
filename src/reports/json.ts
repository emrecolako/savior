import type { AnalysisResult, ReportConfig } from "../types.js";
import { writeFileSync } from "node:fs";

/**
 * Export analysis results as structured JSON.
 * Useful for piping into other tools, dashboards, or AI agents.
 */
export function writeJsonReport(result: AnalysisResult, config: ReportConfig): void {
  const output = {
    meta: {
      tool: "genomic-report",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      inputFile: result.inputFile,
      inputFormat: result.inputFormat,
      buildVersion: result.buildVersion,
      totalSnps: result.totalSnps,
      matchedCount: result.matchedCount,
    },
    apoe: result.apoe,
    variants: result.variants,
    pathways: result.pathways.map((p) => ({
      ...p,
      variants: p.variants.map((v) => v.rsid), // de-duplicate — just rsids
    })),
    actionItems: result.actionItems,
    pharmacogenomics: {
      metaboliserProfile: result.pharmacogenomics.genes,
      drugInteractions: result.pharmacogenomics.interactions,
    },
  };

  writeFileSync(config.outputPath, JSON.stringify(output, null, 2), "utf-8");
}
