import chalk, { type ChalkInstance } from "chalk";
import type {
  ApoeGenotype,
  GeneMetabolizerStatus,
  PathwayConvergence,
  ActionItem,
  MatchedVariant,
  Severity,
} from "../types.js";
import {
  termWidth,
  SYM,
  colorRisk,
  colorPhenotype,
  colorSeverity,
  stripAnsi,
  pad,
  dim,
  bold,
  rsidLink,
} from "./theme.js";

// ─── Box drawing ────────────────────────────────────────────────

interface BoxOpts {
  borderColor?: ChalkInstance;
  double?: boolean;
  width?: number;
}

const SINGLE = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };
const DOUBLE = { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║", ml: "╠", mr: "╣" };

export function drawBox(title: string, lines: string[], opts?: BoxOpts): string {
  const chars = opts?.double ? DOUBLE : SINGLE;
  const color = opts?.borderColor ?? chalk.gray;
  const maxW = Math.max(40, Math.min(opts?.width ?? termWidth, termWidth));
  const innerW = maxW - 4; // 2 border + 2 padding

  const titleStripped = stripAnsi(title);
  const titlePad = Math.max(0, innerW - titleStripped.length);
  const titleLine = `${color(chars.v)} ${bold(title)}${" ".repeat(titlePad)} ${color(chars.v)}`;

  const top = color(`${chars.tl}${chars.h.repeat(maxW - 2)}${chars.tr}`);
  const separator = color(`${chars.ml}${chars.h.repeat(maxW - 2)}${chars.mr}`);
  const bottom = color(`${chars.bl}${chars.h.repeat(maxW - 2)}${chars.br}`);

  const contentLines = (lines.length === 0 ? [dim("  No data")] : lines).map((line) => {
    const visible = stripAnsi(line).length;
    const padRight = Math.max(0, innerW - visible);
    return `${color(chars.v)} ${line}${" ".repeat(padRight)} ${color(chars.v)}`;
  });

  const emptyLine = `${color(chars.v)} ${" ".repeat(innerW)} ${color(chars.v)}`;

  return [top, titleLine, separator, ...contentLines, emptyLine, bottom].join("\n");
}

// ─── APOE panel ─────────────────────────────────────────────────

export function apoePanel(apoe: ApoeGenotype): string {
  const riskColors: Record<string, ChalkInstance> = {
    low: chalk.green,
    average: chalk.cyan,
    elevated: chalk.yellow,
    high: chalk.red,
  };
  const borderColor = riskColors[apoe.riskLevel] ?? chalk.gray;

  const lines = [
    `${dim("Diplotype:")}  ${bold(apoe.diplotype)}`,
    `${dim("Risk Level:")} ${colorRisk(apoe.riskLevel)}`,
    "",
    ...wrapText(apoe.explanation, termWidth - 8),
  ];

  return drawBox(`${SYM.dna}  APOE Genotype`, lines, { borderColor });
}

// ─── PGx alert panel ────────────────────────────────────────────

export function pgxAlertPanel(genes: GeneMetabolizerStatus[]): string {
  const abnormal = genes.filter(
    (g) => g.phenotype !== "normal" && g.phenotype !== "indeterminate"
  );

  if (abnormal.length === 0) {
    return `  ${SYM.check} ${chalk.green("All metabolizer phenotypes normal — no pharmacogenomic alerts")}`;
  }

  const lines = abnormal.map((g) => {
    const phenoBadge = colorPhenotype(g.phenotype, ` ${g.phenotype.toUpperCase()} `);
    return `  ${SYM.warn} ${bold(g.gene)}  ${phenoBadge}  ${dim(g.diplotype)}`;
  });

  return drawBox(`${SYM.pill}  Pharmacogenomics Alerts`, lines, {
    borderColor: chalk.yellow,
  });
}

// ─── Critical alert box ─────────────────────────────────────────

export function criticalAlertBox(title: string, detail: string): string {
  const lines = wrapText(detail, termWidth - 8);
  return drawBox(`${SYM.warn}  ${title}`, lines, {
    borderColor: chalk.red,
    double: true,
  });
}

// ─── Pathway summary panel ──────────────────────────────────────

export function pathwaySummaryPanel(pathways: PathwayConvergence[]): string {
  if (pathways.length === 0) return "";

  const riskDots: Record<string, string> = {
    high: chalk.red(SYM.dot),
    elevated: chalk.yellow(SYM.dot),
    moderate: chalk.cyan(SYM.dot),
    low: chalk.green(SYM.dot),
  };

  const lines = pathways.map((p) => {
    const dot = riskDots[p.riskLevel] ?? chalk.gray(SYM.dot);
    const name = pad(p.name, 35);
    const score = dim(`synergy: ${p.synergyScore}`);
    const genes = dim(`(${p.involvedGenes.slice(0, 4).join(", ")}${p.involvedGenes.length > 4 ? "…" : ""})`);
    return `  ${dot} ${name} ${score}  ${genes}`;
  });

  return drawBox("Pathway Convergence", lines, { borderColor: chalk.cyan });
}

// ─── Action items panel ─────────────────────────────────────────

export function actionItemsPanel(items: ActionItem[]): string {
  if (items.length === 0) return "";

  const groups: Record<string, ActionItem[]> = {
    urgent: [],
    recommended: [],
    consider: [],
    informational: [],
  };

  for (const item of items) {
    (groups[item.priority] ?? groups.informational).push(item);
  }

  const lines: string[] = [];
  const priorityColors: Record<string, ChalkInstance> = {
    urgent: chalk.red,
    recommended: chalk.yellow,
    consider: chalk.cyan,
    informational: chalk.gray,
  };

  for (const [priority, group] of Object.entries(groups)) {
    if (group.length === 0) continue;
    lines.push(priorityColors[priority](`  ${priority.toUpperCase()} (${group.length})`));
    for (const item of group.slice(0, 5)) {
      lines.push(`    ${SYM.arrow} ${item.title}`);
    }
    if (group.length > 5) {
      lines.push(dim(`    … and ${group.length - 5} more`));
    }
    lines.push("");
  }

  return drawBox("Action Items", lines, { borderColor: chalk.yellow });
}

// ─── Variant severity summary ───────────────────────────────────

export function variantSummaryLine(variants: MatchedVariant[]): string {
  const counts = new Map<Severity, number>();
  for (const v of variants) {
    counts.set(v.severity, (counts.get(v.severity) ?? 0) + 1);
  }

  const severityOrder: Severity[] = ["critical", "high", "moderate", "low", "protective", "carrier", "informational"];
  const parts = severityOrder
    .filter((s) => (counts.get(s) ?? 0) > 0)
    .map((s) => colorSeverity(s, `${counts.get(s)} ${s}`));

  return parts.join(dim(" · "));
}

// ─── Completion box ─────────────────────────────────────────────

export function completionBox(outputPath: string, elapsed: string, format: string): string {
  const lines = [
    `  ${SYM.arrow} ${format} card written ${SYM.arrow} ${bold(outputPath)}`,
    `  ${SYM.arrow} Completed in ${bold(elapsed)}`,
    "",
    `  ${chalk.green("Print this card and hand it to your GP or pharmacist.")}`,
  ];

  return drawBox(`${SYM.check}  Complete`, lines, { borderColor: chalk.green });
}

// ─── Error panel ────────────────────────────────────────────────

export function errorPanel(message: string): string {
  const lines = wrapText(message, termWidth - 8);
  return drawBox(`${SYM.cross}  Error`, lines, {
    borderColor: chalk.red,
    double: true,
  });
}

// ─── Text wrapping helper ───────────────────────────────────────

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
