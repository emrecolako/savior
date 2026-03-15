import chalk from "chalk";
import type { AnalysisResult } from "../types.js";
import { isTTY, termWidth, bold, dim, colorRisk, SYM } from "./theme.js";

export async function printDashboard(
  result: AnalysisResult,
  outputPath: string,
  elapsed: string
): Promise<void> {
  const w = Math.max(40, Math.min(62, termWidth));
  const innerW = w - 4;

  // Title
  let title = "ANALYSIS COMPLETE";
  if (isTTY) {
    try {
      const gradient = (await import("gradient-string")).default;
      title = gradient.pastel(title);
    } catch {
      title = chalk.bold.cyan(title);
    }
  } else {
    title = chalk.bold(title);
  }

  const c = chalk.gray;
  const H = "═";
  const V = "║";

  const top = c(`╔${H.repeat(w - 2)}╗`);
  const sep = c(`╠${H.repeat(w - 2)}╣`);
  const bot = c(`╚${H.repeat(w - 2)}╝`);

  function row(content: string, padding = innerW): string {
    // Calculate visible length, accounting for ANSI
    const stripped = content.replace(/\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007]*\u0007/g, "");
    const padR = Math.max(0, padding - stripped.length);
    return `${c(V)} ${content}${" ".repeat(padR)} ${c(V)}`;
  }

  const apoeText = `${result.apoe.diplotype} (${colorRisk(result.apoe.riskLevel)})`;
  const matchedText = bold(String(result.matchedCount));
  const pathwaysText = bold(String(result.pathways.length));
  const pgxText = bold(String(result.pharmacogenomics.genes.length));
  const actionsText = bold(String(result.actionItems.length));
  const prsText = result.prs ? bold(String(result.prs.traits.length)) : dim("—");

  // Center the title
  const titleStripped = title.replace(/\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007]*\u0007/g, "");
  const titlePadL = Math.max(0, Math.floor((innerW - titleStripped.length) / 2));
  const titlePadR = Math.max(0, innerW - titleStripped.length - titlePadL);
  const titleRow = `${c(V)} ${" ".repeat(titlePadL)}${title}${" ".repeat(titlePadR)} ${c(V)}`;

  const lines = [
    "",
    top,
    row(""),
    titleRow,
    row(""),
    sep,
    row(""),
    row(`  Variants  ${matchedText} matched      APOE  ${apoeText}`),
    row(`  Pathways  ${pathwaysText} detected      PGx   ${pgxText} enzymes profiled`),
    row(`  Actions   ${actionsText} generated     PRS   ${prsText} traits scored`),
    row(""),
    sep,
    row(`  ${SYM.arrow} Report written ${SYM.arrow} ${bold(outputPath)}`),
    row(`  ${SYM.arrow} Completed in ${bold(elapsed)}`),
    row(""),
    bot,
    "",
  ];

  console.log(lines.join("\n"));
}
