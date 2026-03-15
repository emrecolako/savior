import type { AnalysisResult, MatchedVariant, PathwayConvergence, ReportConfig, DrugInteraction } from "../types.js";
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

const RISK_BADGE: Record<string, string> = {
  high: "🔴 HIGH",
  elevated: "🟠 ELEVATED",
  moderate: "🟡 MODERATE",
  low: "🔵 LOW",
};

function variantTable(variants: MatchedVariant[], includeResearch = false): string {
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
    if (includeResearch && v.recentFindings && v.recentFindings.length > 0) {
      for (const f of v.recentFindings.slice(0, 3)) {
        lines.push(
          `| | 📄 _Recent: [${f.title}](${f.url}) — ${f.source}, ${f.date}_ | | | | | |`
        );
      }
    }
  }

  return lines.join("\n") + "\n";
}

function pathwaySection(p: PathwayConvergence): string {
  const lines: string[] = [];
  const badge = RISK_BADGE[p.riskLevel] ?? p.riskLevel.toUpperCase();

  lines.push(`### ${p.name} — ${badge} (Score: ${p.synergyScore}/100)\n`);
  lines.push(`${p.narrative}\n`);

  if (p.compoundEffects.length > 0) {
    lines.push(`> **Compound Effects:**`);
    for (const effect of p.compoundEffects) {
      lines.push(`> - ${effect}`);
    }
    lines.push("");
  }

  lines.push(`**Involved genes:** ${p.involvedGenes.join(", ")}\n`);
  lines.push(variantTable(p.variants));

  if (p.actions.length > 0) {
    lines.push(`**Recommended actions:**`);
    for (const action of p.actions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  return lines.join("\n");
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

  // ── Executive Summary ──
  if (config.includeSummary) {
    lines.push(`## Executive Summary\n`);

    const topPathways = result.pathways
      .filter((p) => p.riskLevel !== "low")
      .slice(0, 5); // already sorted by synergy score

    if (topPathways.length === 0) {
      lines.push(`No elevated pathway-level risks identified.\n`);
    } else {
      for (const p of topPathways) {
        const badge = RISK_BADGE[p.riskLevel] ?? p.riskLevel.toUpperCase();
        lines.push(`- ${badge} **${p.name}** — ${p.variants.length} variant(s) across ${p.involvedGenes.length} gene(s), score ${p.synergyScore}/100`);
      }
      lines.push("");
    }

    // Pharma summary
    const pharma = result.variants.filter(
      (v) => v.category === "pharmacogenomics" && v.riskAlleleCount !== 0
    );
    if (pharma.length > 0) {
      lines.push(`### Drug Reactions (Pharmacogenomics)\n`);
      for (const v of pharma) {
        lines.push(`- **${v.gene}** (${v.rsid}): ${v.condition}`);
      }
      lines.push("");
    }
  }

  // ── Pathway Analysis (primary body) ──
  if (config.includePathways) {
    lines.push(`## Pathway Analysis\n`);
    lines.push(`Variants are clustered by biological pathway to reveal compound effects that isolated SNP analysis misses. Pathways are ranked by synergy score, which accounts for variant severity, zygosity, and multi-gene interactions.\n`);

    for (const p of result.pathways) {
      lines.push(pathwaySection(p));
    }
  }

  // ── Pharmacogenomics Drug-Gene Matrix ──
  if (result.pharmacogenomics) {
    const pgx = result.pharmacogenomics;
    lines.push(`## Pharmacogenomics: Drug-Gene Interaction Matrix\n`);

    // Metabolizer summary table
    lines.push(`### Metaboliser Profile\n`);
    lines.push(`| Enzyme | Phenotype | Activity | Diplotype |`);
    lines.push(`|--------|-----------|----------|-----------|`);
    for (const g of pgx.genes) {
      const phLabel = g.phenotype === "normal" ? "Normal" :
        g.phenotype === "poor" ? "**POOR**" :
        g.phenotype === "intermediate" ? "**Intermediate**" :
        g.phenotype === "ultra-rapid" ? "**Ultra-Rapid**" :
        g.phenotype === "rapid" ? "**Rapid**" : "Indeterminate";
      const act = g.activityScore !== null ? String(g.activityScore) : "—";
      lines.push(`| **${g.gene}** | ${phLabel} | ${act} | ${g.diplotype} |`);
    }
    lines.push("");

    // Drug interaction matrix grouped by class
    lines.push(`### Drug Interactions\n`);
    const drugClasses = new Map<string, DrugInteraction[]>();
    for (const di of pgx.interactions) {
      const group = drugClasses.get(di.drugClass) ?? [];
      group.push(di);
      drugClasses.set(di.drugClass, group);
    }

    for (const [cls, drugs] of drugClasses) {
      lines.push(`#### ${cls}\n`);
      lines.push(`| Medication | Enzyme | Action | Detail |`);
      lines.push(`|-----------|--------|--------|--------|`);
      for (const di of drugs) {
        const actionLabel = di.action === "avoid" ? "**AVOID**" :
          di.action === "use alternative" ? "**USE ALTERNATIVE**" :
          di.action === "use standard dose" ? "Standard dose" :
          di.action;
        lines.push(`| ${di.drug} | ${di.primaryGene} | ${actionLabel} | ${di.detail} |`);
      }
      lines.push("");
    }

    // Highlight actionable alerts
    const actionable = pgx.interactions.filter(
      (di) => di.action !== "use standard dose" && di.action !== "no actionable variant detected" && di.action !== "see notes"
    );
    if (actionable.length > 0) {
      lines.push(`### Actionable Alerts\n`);
      for (const di of actionable) {
        lines.push(`- **${di.drug}** (${di.primaryGene}): ${di.action} — ${di.detail}`);
      }
      lines.push("");
    }

    lines.push("> _A standalone GP card can be exported via: `genomic-report gp-card -i <genome> -o card.md`_\n");
  }

  // ── Individual Variant Reference (appendix) ──
  if (config.includeRawVariants) {
    lines.push(`## Appendix: Individual Variant Reference\n`);
    lines.push(`_Variants listed by severity for reference. See Pathway Analysis above for biological context._\n`);

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

      lines.push(`### ${SEVERITY_EMOJI[sev]} ${labels[sev]}\n`);
      lines.push(`_${svars.length} variant(s) flagged_\n`);
      lines.push(variantTable(svars, config.includeRecentLiterature));
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
    lines.push(`This analysis cross-referenced ${result.totalSnps.toLocaleString()} SNPs against a curated database of clinically significant variants drawn from ClinVar, GWAS Catalog, PharmGKB, CPIC guidelines, and published meta-analyses. Variants are clustered into ${result.pathways.length} biological pathways with synergy-aware scoring that accounts for multi-gene interactions, zygosity, and variant severity.\n`);
    lines.push(`**Limitations:** (1) Consumer arrays cover ~640K of ~10M+ common variants. (2) Cannot detect CNVs, structural variants, or repeat expansions. (3) Odds ratios are population-level statistics. (4) HLA typing from tag SNPs is approximate. (5) Pathway synergy scores are heuristic, not validated polygenic risk scores. For clinical-grade analysis, consider whole exome/genome sequencing with a genetic counsellor.\n`);

    if (config.includeRecentLiterature) {
      lines.push(`Research enrichment via PubMed E-utilities (last 2 years). Research queries use variant rsIDs and gene names only — no genotype data is transmitted.\n`);
    }
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
