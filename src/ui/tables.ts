import chalk from "chalk";
import type {
  PrsTraitResult,
  MatchedVariant,
  SnpEntry,
  DrugGeneMatrix,
  Severity,
  Category,
} from "../types.js";
import {
  SYM,
  colorSeverity,
  colorPrsCategory,
  colorAction,
  colorPhenotype,
  dim,
  bold,
  pad,
  stripAnsi,
} from "./theme.js";

// ─── PRS table with inline bar charts ───────────────────────────

function percentileBar(pct: number): string {
  const BAR_WIDTH = 10;
  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;

  let barColor: (s: string) => string;
  if (pct < 40) barColor = chalk.green;
  else if (pct < 60) barColor = chalk.cyan;
  else if (pct < 80) barColor = chalk.yellow;
  else barColor = chalk.red;

  return barColor(SYM.bar.repeat(filled)) + chalk.gray(SYM.barEmpty.repeat(empty));
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function prsTable(traits: PrsTraitResult[]): string {
  if (traits.length === 0) return "";

  const header = `  ${pad(bold("Trait"), 33)}  ${pad(bold("Percentile"), 22)}  ${pad(bold("Risk"), 16)}  ${bold("Coverage")}`;
  const divider = dim("  " + "─".repeat(78));

  const rows = traits.map((t) => {
    const name = pad(t.traitName, 30);
    if (t.riskCategory === "insufficient") {
      return `  ${name}  ${pad(chalk.gray("  —"), 22)}  ${pad(chalk.gray("INSUFFICIENT"), 16)}  ${dim(`${t.variantsUsed}/${t.variantsTotal}`)}`;
    }
    const pct = Math.round(t.percentile);
    const bar = percentileBar(pct);
    const pctText = `${String(pct).padStart(3)}${ordinalSuffix(pct)}`;
    const barCell = `${bar} ${pctText}`;
    const category = colorPrsCategory(t.riskCategory);
    const coverage = dim(`${t.variantsUsed}/${t.variantsTotal}`);
    return `  ${name}  ${pad(barCell, 22)}  ${pad(category, 16)}  ${coverage}`;
  });

  const title = `\n  ${bold("Polygenic Risk Scores")}\n`;
  return [title, header, divider, ...rows, ""].join("\n");
}

// ─── Severity breakdown table ───────────────────────────────────

export function severityBreakdownTable(variants: MatchedVariant[]): string {
  const counts = new Map<Severity, number>();
  for (const v of variants) {
    counts.set(v.severity, (counts.get(v.severity) ?? 0) + 1);
  }

  const order: Severity[] = ["critical", "high", "moderate", "low", "protective", "carrier", "informational"];
  const rows = order
    .filter((s) => (counts.get(s) ?? 0) > 0)
    .map((s) => {
      const count = counts.get(s)!;
      return `    ${colorSeverity(s, pad(s, 18))} ${String(count).padStart(4)}`;
    });

  if (rows.length === 0) return dim("    No variants matched.\n");

  return [`  ${bold("By severity:")}`, ...rows, ""].join("\n");
}

// ─── Category breakdown table ───────────────────────────────────

export function categoryBreakdownTable(entries: SnpEntry[]): string {
  const counts = new Map<Category, number>();
  for (const e of entries) {
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const rows = sorted.map(([cat, count]) => {
    return `    ${pad(cat, 22)} ${String(count).padStart(4)}`;
  });

  return [`  ${bold("By category:")}`, ...rows, ""].join("\n");
}

// ─── PGx matrix table ──────────────────────────────────────────

export function pgxMatrixTable(matrix: DrugGeneMatrix): string {
  if (matrix.genes.length === 0) return "";

  const geneRows = matrix.genes.map((g) => {
    const phenoText = colorPhenotype(g.phenotype, pad(g.phenotype, 16));
    return `    ${pad(bold(g.gene), 14)}  ${phenoText}  ${dim(g.diplotype)}`;
  });

  const actionable = matrix.interactions.filter(
    (di) =>
      di.action !== "use standard dose" &&
      di.action !== "no actionable variant detected" &&
      di.action !== "see notes"
  );

  const interactionRows = actionable.slice(0, 10).map((di) => {
    const drug = pad(di.drug, 22);
    const gene = pad(di.primaryGene, 10);
    const action = colorAction(di.action);
    return `    ${drug}  ${gene}  ${action}`;
  });

  const lines: string[] = [
    `\n  ${bold("Enzyme Metabolizer Status")}`,
    dim("  " + "─".repeat(50)),
    ...geneRows,
  ];

  if (interactionRows.length > 0) {
    lines.push("");
    lines.push(`  ${bold("Key Drug Interactions")}`);
    lines.push(dim("  " + "─".repeat(50)));
    lines.push(...interactionRows);
    if (actionable.length > 10) {
      lines.push(dim(`    … and ${actionable.length - 10} more`));
    }
  }

  lines.push("");
  return lines.join("\n");
}
