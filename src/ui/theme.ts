import chalk, { type ChalkInstance } from "chalk";
import type { Severity, MetabolizerPhenotype, DrugAction } from "../types.js";

// ─── TTY detection ──────────────────────────────────────────────

export const isTTY = !!(process.stdout.isTTY);
export const termWidth = Math.min(process.stdout.columns ?? 80, 100);

// ─── Symbols ────────────────────────────────────────────────────

export const SYM = {
  check: chalk.green("✔"),
  cross: chalk.red("✖"),
  arrow: chalk.cyan("→"),
  warn: chalk.yellow("⚠"),
  dot: "●",
  bar: "█",
  barEmpty: "░",
  dna: "🧬",
  pill: "💊",
} as const;

// ─── Severity colors ────────────────────────────────────────────

const SEVERITY_COLORS: Record<Severity, ChalkInstance> = {
  critical: chalk.bgRed.white.bold,
  high: chalk.red,
  moderate: chalk.yellow,
  low: chalk.cyan,
  protective: chalk.green,
  carrier: chalk.magenta,
  informational: chalk.gray,
};

export function colorSeverity(severity: Severity, text?: string): string {
  const fn = SEVERITY_COLORS[severity] ?? chalk.white;
  return fn(text ?? severity);
}

// ─── Risk level colors ──────────────────────────────────────────

const RISK_COLORS: Record<string, ChalkInstance> = {
  low: chalk.green,
  average: chalk.cyan,
  moderate: chalk.yellow,
  elevated: chalk.yellow,
  high: chalk.red,
};

export function colorRisk(level: string, text?: string): string {
  const fn = RISK_COLORS[level] ?? chalk.white;
  return fn(text ?? level.toUpperCase());
}

// ─── Metabolizer phenotype colors ───────────────────────────────

const PHENOTYPE_COLORS: Record<MetabolizerPhenotype, ChalkInstance> = {
  poor: chalk.red,
  intermediate: chalk.yellow,
  normal: chalk.green,
  rapid: chalk.magenta,
  "ultra-rapid": chalk.magenta,
  indeterminate: chalk.gray,
};

export function colorPhenotype(phenotype: MetabolizerPhenotype, text?: string): string {
  const fn = PHENOTYPE_COLORS[phenotype] ?? chalk.white;
  return fn(text ?? phenotype);
}

// ─── Drug action colors ─────────────────────────────────────────

const ACTION_COLORS: Record<DrugAction, ChalkInstance> = {
  avoid: chalk.bgRed.white.bold,
  "use alternative": chalk.red,
  "consider dose reduction": chalk.yellow,
  "consider dose increase": chalk.yellow,
  "use with caution": chalk.yellow,
  "use standard dose": chalk.green,
  "no actionable variant detected": chalk.gray,
  "see notes": chalk.cyan,
};

export function colorAction(action: DrugAction, text?: string): string {
  const fn = ACTION_COLORS[action] ?? chalk.white;
  return fn(text ?? action);
}

// ─── PRS risk category colors ───────────────────────────────────

const PRS_COLORS: Record<string, ChalkInstance> = {
  insufficient: chalk.gray,
  low: chalk.green,
  average: chalk.cyan,
  "above-average": chalk.yellow,
  elevated: chalk.hex("#FF8800"),
  high: chalk.red,
};

export function colorPrsCategory(category: string, text?: string): string {
  const fn = PRS_COLORS[category] ?? chalk.white;
  return fn(text ?? category.toUpperCase());
}

// ─── Terminal hyperlinks (OSC 8) ────────────────────────────────

export function hyperlink(text: string, url: string): string {
  if (!isTTY) return text;
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
}

export function rsidLink(rsid: string): string {
  return hyperlink(rsid, `https://www.ncbi.nlm.nih.gov/snp/${rsid}`);
}

// ─── Utility ────────────────────────────────────────────────────

export function dim(text: string): string {
  return chalk.gray(text);
}

export function bold(text: string): string {
  return chalk.bold(text);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip ANSI escape codes for calculating display width.
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001B\[[0-9;]*m|\u001B\]8;;[^\u0007]*\u0007/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function visibleLength(s: string): string {
  return stripAnsi(s);
}

export function pad(s: string, width: number): string {
  const visible = stripAnsi(s).length;
  const needed = Math.max(0, width - visible);
  return s + " ".repeat(needed);
}
