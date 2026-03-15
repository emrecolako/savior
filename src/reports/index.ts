import type { AnalysisResult, ReportConfig, ReportFormat } from "../types.js";
import { writeMarkdownReport } from "./markdown.js";
import { writeJsonReport } from "./json.js";

/**
 * Generate a report in the specified format.
 */
export function generateReport(result: AnalysisResult, config: ReportConfig): void {
  switch (config.format) {
    case "markdown":
      writeMarkdownReport(result, config);
      break;
    case "json":
      writeJsonReport(result, config);
      break;
    case "docx":
      // TODO: Port the docx generation from the prototype
      throw new Error(
        "DOCX generation not yet ported to the modular codebase. " +
        "Use markdown format for now, or contribute at github.com/yourorg/genomic-report"
      );
    case "html":
      // TODO: HTML report with interactive charts
      throw new Error("HTML report not yet implemented. Contributions welcome!");
    default:
      throw new Error(`Unknown report format: ${config.format}`);
  }
}

export { writeMarkdownReport, generateMarkdown } from "./markdown.js";
export { writeJsonReport } from "./json.js";
