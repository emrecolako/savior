import type { AnalysisResult, MatchedVariant, ReportConfig } from "../types.js";
import { writeFileSync } from "node:fs";

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  moderate: "🟡",
  low: "🔵",
  protective: "🟢",
  carrier: "🟤",
  informational: "⚪",
};

function variantTable(variants: MatchedVariant[]): string {
  if (variants.length === 0) return "_None found._\n";

  const lines = [
    "| rsID | Gene | Genotype | Risk | Zygosity | OR | Evidence |",
    "|------|------|----------|------|----------|-----|---------|",
  ];

  for (const v of variants) {
    const zyg = v.riskAlleleCount === 2 ? "**HOM RISK**" : v.riskAlleleCount === 1 ? "Het" : "Review";
    lines.push(
      `| ${v.rsid} | **${v.gene}** | ${v.genotype} | ${v.riskAllele} | ${zyg} | ${v.oddsRatio ?? "—"} | ${v.evidenceLevel} |`
    );
    lines.push(
      `| | _${v.condition}_ | | | | | |`
    );
  }

  return lines.join("\n") + "\n";
}

export function generateMarkdown(result: AnalysisResult, config: ReportConfig): string {
  const lines: string[] = [];
  const name = config.subjectName ?? "Subject";

  // ── Header ──
  lines.push(`# Comprehensive Genomic Analysis Report`);
  lines.push(`**${name}** — ${result.inputFormat} raw data\n`);
  lines.push(`Generated: ${result.analysisDate} | SNPs: ${result.totalSnps.toLocaleString()} | Clinical matches: ${result.matchedCount}\n`);

  lines.push(`> **Disclaimer:** This report is for research and educational purposes only. It is not a clinical diagnosis. Always discuss findings with a qualified healthcare provider.\n`);

  // ── APOE ──
  lines.push(`## APOE Genotype\n`);
  lines.push(`**${result.apoe.diplotype}** — ${result.apoe.explanation}\n`);

  // ── Polygenic Risk Scores ──
  if (config.includePrs && result.prs && result.prs.traits.length > 0) {
    lines.push(`## Polygenic Risk Scores\n`);
    lines.push(`Polygenic risk scores aggregate the effects of hundreds to thousands of genetic variants to estimate overall genetic predisposition for complex traits. Scores are normalised against a reference population to produce percentile rankings.\n`);

    // Summary table
    lines.push(`| Trait | Percentile | Risk | Coverage | PGS ID |`);
    lines.push(`|-------|-----------|------|----------|--------|`);
    for (const t of result.prs.traits) {
      const pctStr = `${Math.round(t.percentile)}${ordinalSuffix(Math.round(t.percentile))}`;
      lines.push(`| ${t.traitName} | **${pctStr}** | ${t.riskCategory.toUpperCase()} | ${Math.round(t.coveragePct)}% | ${t.pgsId} |`);
    }
    lines.push("");

    // Per-trait detail
    for (const t of result.prs.traits) {
      const pctStr = `${Math.round(t.percentile)}${ordinalSuffix(Math.round(t.percentile))}`;
      const riskIcon = t.percentile >= 95 ? "🔴" : t.percentile >= 80 ? "🟠" : t.percentile >= 60 ? "🟡" : "🟢";
      lines.push(`### ${riskIcon} ${t.traitName} — ${pctStr} Percentile (${t.riskCategory.toUpperCase()})\n`);
      lines.push(`${t.interpretation}\n`);
      lines.push(`- **Variants scored:** ${t.variantsUsed.toLocaleString()} of ${t.variantsTotal.toLocaleString()} (${Math.round(t.coveragePct)}% coverage)`);
      lines.push(`- **Raw score:** ${t.rawScore.toFixed(4)} | **Z-score:** ${t.zScore.toFixed(2)}\n`);

      if (t.topContributors.length > 0) {
        lines.push(`**Top contributing variants:**\n`);
        lines.push(`| rsID | Gene | Effect Allele | Dosage | Contribution |`);
        lines.push(`|------|------|---------------|--------|--------------|`);
        for (const c of t.topContributors) {
          lines.push(`| ${c.rsid} | ${c.gene ?? "—"} | ${c.effectAllele} | ${c.dosage} | ${c.contribution > 0 ? "+" : ""}${c.contribution.toFixed(4)} |`);
        }
        lines.push("");
      }
    }

    if (result.prs.limitations.length > 0) {
      lines.push(`> **PRS Limitations:** ${result.prs.limitations.join(" ")}\n`);
    }
  }

  // ── Plain-English Summary ──
  if (config.includeSummary) {
    lines.push(`## Summary (Plain English)\n`);

    const pathwaySummaries = result.pathways
      .filter((p) => p.riskLevel !== "low")
      .sort((a, b) => {
        const rank = { high: 0, elevated: 1, moderate: 2, low: 3 };
        return (rank[a.riskLevel] ?? 9) - (rank[b.riskLevel] ?? 9);
      });

    for (const p of pathwaySummaries) {
      const icon = p.riskLevel === "high" ? "🔴" : p.riskLevel === "elevated" ? "🟠" : "🟡";
      const homCount = p.variants.filter((v) => v.riskAlleleCount === 2).length;
      lines.push(`### ${icon} ${p.name}\n`);
      lines.push(`**${p.variants.length}** risk variant(s) identified, **${homCount}** homozygous. Risk level: **${p.riskLevel.toUpperCase()}**.\n`);
      lines.push(`${p.assessment}\n`);
    }

    // Pharma summary
    const pharma = result.variants.filter(
      (v) => v.category === "pharmacogenomics" && v.riskAlleleCount !== 0
    );
    if (pharma.length > 0) {
      lines.push(`### 💊 Drug Reactions (Pharmacogenomics)\n`);
      for (const v of pharma) {
        lines.push(`- **${v.gene}** (${v.rsid}): ${v.condition}`);
      }
      lines.push("");
    }
  }

  // ── Variants by severity ──
  if (config.includeRawVariants) {
    const severities = ["critical", "high", "moderate", "low", "protective", "carrier", "informational"] as const;
    const labels: Record<string, string> = {
      critical: "Critical — Immediate Clinical Relevance",
      high: "High — Significant Clinical Associations",
      moderate: "Moderate — Established Associations",
      low: "Low — Minor / Preliminary Associations",
      protective: "Protective — Favourable Variants",
      carrier: "Carrier Status",
      informational: "Informational — Traits",
    };

    for (const sev of severities) {
      const svars = result.variants.filter(
        (v) => v.severity === sev && (v.riskAlleleCount > 0 || v.riskAlleleCount === -1)
      );
      if (svars.length === 0) continue;

      lines.push(`## ${SEVERITY_EMOJI[sev]} ${labels[sev]}\n`);
      lines.push(`_${svars.length} variant(s) flagged_\n`);
      lines.push(variantTable(svars));
    }
  }

  // ── Pathway convergence ──
  if (config.includePathways) {
    lines.push(`## Pathway Convergence Analysis\n`);
    for (const p of result.pathways) {
      lines.push(`### ${p.name}\n`);
      lines.push(`- **Risk level:** ${p.riskLevel.toUpperCase()}`);
      lines.push(`- **Variants:** ${p.variants.length} (${p.variants.filter((v) => v.riskAlleleCount === 2).length} homozygous)`);
      lines.push(`- **Genes:** ${[...new Set(p.variants.map((v) => v.gene))].join(", ")}`);
      lines.push(`- **Assessment:** ${p.assessment}\n`);
    }
  }

  // ── Action items ──
  if (config.includeActionItems) {
    lines.push(`## Prioritised Action List\n`);
    const priorities = ["urgent", "recommended", "consider", "informational"] as const;
    for (const pri of priorities) {
      const items = result.actionItems.filter((a) => a.priority === pri);
      if (items.length === 0) continue;
      lines.push(`### ${pri.charAt(0).toUpperCase() + pri.slice(1)}\n`);
      for (const item of items) {
        lines.push(`- **${item.title}** — ${item.detail}`);
      }
      lines.push("");
    }
  }

  // ── Methodology ──
  if (config.includeMethodology) {
    lines.push(`## Methodology & Limitations\n`);
    lines.push(`This analysis cross-referenced ${result.totalSnps.toLocaleString()} SNPs against a curated database of clinically significant variants drawn from ClinVar, GWAS Catalog, PharmGKB, CPIC guidelines, and published meta-analyses.\n`);
    lines.push(`**Limitations:** (1) Consumer arrays cover ~640K of ~10M+ common variants. (2) Cannot detect CNVs, structural variants, or repeat expansions. (3) Odds ratios are population-level statistics. (4) HLA typing from tag SNPs is approximate. For clinical-grade analysis, consider whole exome/genome sequencing with a genetic counsellor.\n`);
  }

  return lines.join("\n");
}

/**
 * Write a markdown report to disk.
 */
export function writeMarkdownReport(result: AnalysisResult, config: ReportConfig): void {
  const md = generateMarkdown(result, config);
  writeFileSync(config.outputPath, md, "utf-8");
}
