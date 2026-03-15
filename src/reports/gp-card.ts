import type { AnalysisResult, DrugGeneMatrix, GeneMetabolizerStatus, DrugInteraction } from "../types.js";
import { writeFileSync } from "node:fs";

// ─── Phenotype display helpers ───────────────────────────────

const PHENOTYPE_BADGE: Record<string, string> = {
  "ultra-rapid":  "UR",
  "rapid":        "RA",
  "normal":       "NM",
  "intermediate": "IM",
  "poor":         "PM",
  "indeterminate": "??",
};

const PHENOTYPE_EMOJI: Record<string, string> = {
  "ultra-rapid":  "⚡",
  "rapid":        "🔼",
  "normal":       "✅",
  "intermediate": "⚠️",
  "poor":         "🔴",
  "indeterminate": "❓",
};

const ACTION_SYMBOL: Record<string, string> = {
  "use standard dose":              "✅",
  "use with caution":               "⚠️",
  "consider dose reduction":        "🔽",
  "consider dose increase":         "🔼",
  "use alternative":                "🔄",
  "avoid":                          "🚫",
  "no actionable variant detected": "—",
  "see notes":                      "📋",
};

// ─── Markdown GP card ────────────────────────────────────────

export function generateGpCardMarkdown(result: AnalysisResult, subjectName?: string): string {
  const pgx = result.pharmacogenomics;
  const name = subjectName ?? "Patient";
  const lines: string[] = [];

  // Header
  lines.push(`# Pharmacogenomics Alert Card`);
  lines.push(`**${name}** | Generated: ${result.analysisDate}\n`);
  lines.push(`> **IMPORTANT:** This card summarises predicted drug metabolism based on genetic variants. It is not a substitute for clinical judgement. Confirm with validated pharmacogenomic testing before making prescribing decisions.\n`);

  // ── Metabolizer status summary ──
  lines.push(`## Metaboliser Status\n`);
  lines.push(`| Enzyme | Phenotype | Activity Score | Diplotype | Key Variants |`);
  lines.push(`|--------|-----------|----------------|-----------|--------------|`);

  for (const g of pgx.genes) {
    const badge = `**${PHENOTYPE_BADGE[g.phenotype] ?? "??"}** ${PHENOTYPE_EMOJI[g.phenotype] ?? ""}`;
    const activity = g.activityScore !== null ? String(g.activityScore) : "—";
    const vars = g.detectedVariants.length > 0 ? g.detectedVariants.join(", ") : "None detected";
    lines.push(`| **${g.gene}** | ${badge} ${g.phenotype} | ${activity} | ${g.diplotype} | ${vars} |`);
  }
  lines.push("");

  // Phenotype legend
  lines.push(`> **Legend:** PM = Poor Metaboliser, IM = Intermediate, NM = Normal, RA = Rapid, UR = Ultra-Rapid\n`);

  // ── Drug-gene interaction matrix ──
  lines.push(`## Drug-Gene Interaction Matrix\n`);

  // Group by drug class
  const drugClasses = new Map<string, DrugInteraction[]>();
  for (const di of pgx.interactions) {
    const group = drugClasses.get(di.drugClass) ?? [];
    group.push(di);
    drugClasses.set(di.drugClass, group);
  }

  for (const [drugClass, drugs] of drugClasses) {
    lines.push(`### ${drugClass}\n`);
    lines.push(`| Medication | Enzyme | Status | Action | Detail | Evidence |`);
    lines.push(`|-----------|--------|--------|--------|--------|----------|`);

    for (const di of drugs) {
      const sym = ACTION_SYMBOL[di.action] ?? "";
      const geneStatus = pgx.genes.find((g) => g.gene === di.primaryGene);
      const phenLabel = geneStatus ? `${PHENOTYPE_BADGE[geneStatus.phenotype]} ${geneStatus.phenotype}` : "—";
      lines.push(`| **${di.drug}** | ${di.primaryGene} | ${phenLabel} | ${sym} ${di.action} | ${di.detail} | ${di.evidence} |`);
    }
    lines.push("");
  }

  // ── Actionable alerts (non-standard actions) ──
  const actionable = pgx.interactions.filter(
    (di) => di.action !== "use standard dose" && di.action !== "no actionable variant detected" && di.action !== "see notes"
  );

  if (actionable.length > 0) {
    lines.push(`## Actionable Alerts\n`);
    lines.push(`The following medications require attention based on your metaboliser profile:\n`);

    // Sort by severity: avoid > use alternative > dose reduction > dose increase > caution
    const actionPriority: Record<string, number> = {
      "avoid": 0, "use alternative": 1, "consider dose reduction": 2,
      "consider dose increase": 3, "use with caution": 4,
    };
    actionable.sort((a, b) => (actionPriority[a.action] ?? 99) - (actionPriority[b.action] ?? 99));

    for (const di of actionable) {
      const sym = ACTION_SYMBOL[di.action] ?? "";
      lines.push(`- ${sym} **${di.drug}** (${di.primaryGene}): **${di.action.toUpperCase()}** — ${di.detail}`);
    }
    lines.push("");
  }

  // ── Gene detail cards ──
  lines.push(`## Gene Detail\n`);
  for (const g of pgx.genes) {
    if (g.phenotype === "normal" && g.detectedVariants.length === 0) continue; // skip unremarkable
    lines.push(`### ${g.gene} — ${g.phenotype} metaboliser\n`);
    lines.push(`${g.explanation}\n`);
    if (g.detectedVariants.length > 0) {
      lines.push(`- **Detected variants:** ${g.detectedVariants.join(", ")}`);
    }
    lines.push(`- **Diplotype:** ${g.diplotype}`);
    lines.push(`- **Activity score:** ${g.activityScore !== null ? g.activityScore : "N/A"}\n`);
  }

  // Footer
  lines.push(`---`);
  lines.push(`_Pharmacogenomics card generated by genomic-report. Based on CPIC and DPWG guidelines. This card should be presented to your healthcare provider and pharmacist. Not a clinical diagnosis._`);

  return lines.join("\n");
}

// ─── JSON GP card (machine-readable) ─────────────────────────

export function generateGpCardJson(result: AnalysisResult, subjectName?: string): object {
  const pgx = result.pharmacogenomics;

  return {
    cardType: "pharmacogenomics-alert",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    patient: subjectName ?? "Patient",
    analysisDate: result.analysisDate,
    metaboliserProfile: pgx.genes.map((g) => ({
      gene: g.gene,
      phenotype: g.phenotype,
      phenotypeCode: PHENOTYPE_BADGE[g.phenotype] ?? "??",
      activityScore: g.activityScore,
      diplotype: g.diplotype,
      detectedVariants: g.detectedVariants,
    })),
    drugInteractions: pgx.interactions.map((di) => ({
      drug: di.drug,
      drugClass: di.drugClass,
      gene: di.primaryGene,
      action: di.action,
      detail: di.detail,
      evidence: di.evidence,
    })),
    actionableAlerts: pgx.interactions
      .filter((di) => di.action !== "use standard dose" && di.action !== "no actionable variant detected")
      .map((di) => ({
        drug: di.drug,
        gene: di.primaryGene,
        action: di.action,
        detail: di.detail,
        evidence: di.evidence,
      })),
    disclaimer: "This card is for informational purposes only. Confirm with validated pharmacogenomic testing before making prescribing decisions.",
  };
}

// ─── File writers ────────────────────────────────────────────

export function writeGpCard(result: AnalysisResult, outputPath: string, subjectName?: string): void {
  const md = generateGpCardMarkdown(result, subjectName);
  writeFileSync(outputPath, md, "utf-8");
}

export function writeGpCardJsonFile(result: AnalysisResult, outputPath: string, subjectName?: string): void {
  const json = generateGpCardJson(result, subjectName);
  writeFileSync(outputPath, JSON.stringify(json, null, 2), "utf-8");
}
