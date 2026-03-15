import type {
  ParsedGenome,
  SnpDatabase,
  SnpEntry,
  MatchedVariant,
  ApoeGenotype,
  Zygosity,
  AnalysisResult,
  ActionItem,
  PathwayConvergence,
  PathwayDefinition,
  GenomicReportConfig,
  PrsResult,
} from "../types.js";
import { PATHWAY_DEFINITIONS } from "./pathways.js";
import { buildDrugGeneMatrix } from "./metabolizers.js";
import { computeAllPrs } from "./prs-engine.js";

// ─── Zygosity determination ─────────────────────────────────────

function determineZygosity(genotype: string): Zygosity {
  if (genotype.length === 1) return "hemizygous";
  if (genotype.length === 2) {
    return genotype[0] === genotype[1] ? "homozygous" : "heterozygous";
  }
  return "unknown";
}

// ─── Risk allele counting ───────────────────────────────────────

function countRiskAlleles(genotype: string, riskAllele: string): number {
  if (!riskAllele || riskAllele === "N/A" || riskAllele === "varies") return -1;

  // Handle complex annotations like "A(Met)" → extract just "A"
  const clean = riskAllele.replace(/\(.+\)/, "").trim();
  if (clean.length !== 1) return -1;

  return genotype.split("").filter((a) => a === clean).length;
}

// ─── APOE genotype ──────────────────────────────────────────────

export function determineApoe(genome: ParsedGenome): ApoeGenotype {
  const rs429358 = genome.snps.get("rs429358")?.genotype ?? "??";
  const rs7412 = genome.snps.get("rs7412")?.genotype ?? "??";

  // rs429358: T = e2/e3 allele, C = e4 allele
  // rs7412:   C = e3/e4 allele, T = e2 allele
  const lookup: Record<string, { diplotype: string; riskLevel: ApoeGenotype["riskLevel"]; explanation: string }> = {
    "TT|CC": {
      diplotype: "e3/e3",
      riskLevel: "average",
      explanation: "Most common genotype (~60% of population). Baseline risk for Alzheimer's and cardiovascular disease.",
    },
    "TT|CT": {
      diplotype: "e2/e3",
      riskLevel: "low",
      explanation: "Carries one e2 allele, which is associated with reduced Alzheimer's risk but slightly higher triglycerides.",
    },
    "TT|TT": {
      diplotype: "e2/e2",
      riskLevel: "low",
      explanation: "Two e2 alleles. Lowest Alzheimer's risk, but associated with type III hyperlipoproteinemia in some individuals.",
    },
    "CT|CC": {
      diplotype: "e3/e4",
      riskLevel: "elevated",
      explanation: "One e4 allele. ~3-4x increased Alzheimer's risk. Higher LDL cholesterol. Discuss with physician.",
    },
    "CC|CC": {
      diplotype: "e4/e4",
      riskLevel: "high",
      explanation: "Two e4 alleles. ~12-15x increased Alzheimer's risk. Aggressive cardiovascular risk management recommended.",
    },
    "CT|CT": {
      diplotype: "e2/e4",
      riskLevel: "elevated",
      explanation: "One e2 and one e4 allele. Mixed effects — e4 risk partially offset by e2. Individual assessment needed.",
    },
  };

  const key = `${rs429358}|${rs7412}`;
  const result = lookup[key];

  if (result) {
    return { rs429358, rs7412, ...result };
  }

  return {
    rs429358,
    rs7412,
    diplotype: `Undetermined (rs429358=${rs429358}, rs7412=${rs7412})`,
    riskLevel: "average",
    explanation: "Could not determine APOE genotype from available data.",
  };
}

// ─── Core cross-reference ───────────────────────────────────────

export function crossReference(genome: ParsedGenome, database: SnpDatabase): MatchedVariant[] {
  const variants: MatchedVariant[] = [];

  for (const entry of database.entries) {
    const snp = genome.snps.get(entry.rsid);
    if (!snp) continue;

    const genotype = snp.genotype;
    if (genotype === "--" || genotype === "00") continue; // no-call

    const zygosity = determineZygosity(genotype);
    const riskAlleleCount = countRiskAlleles(genotype, entry.riskAllele);
    const hasRisk = riskAlleleCount > 0 || riskAlleleCount === -1; // -1 = undetermined, flag for review

    // We include all matched variants, even those without risk allele,
    // because "no risk allele" is itself informative (e.g. protective)
    variants.push({
      rsid: entry.rsid,
      chromosome: snp.chromosome,
      position: snp.position,
      genotype,
      zygosity,
      gene: entry.gene,
      riskAllele: entry.riskAllele,
      riskAlleleCount,
      condition: entry.condition,
      category: entry.category,
      severity: entry.severity,
      evidenceLevel: entry.evidenceLevel,
      oddsRatio: entry.oddsRatio,
      notes: entry.notes,
      tags: entry.tags,
    });
  }

  // Sort by severity
  const severityRank: Record<string, number> = {
    critical: 0, high: 1, moderate: 2, low: 3,
    protective: 4, carrier: 5, informational: 6,
  };

  variants.sort((a, b) => {
    const diff = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
    if (diff !== 0) return diff;
    return a.gene.localeCompare(b.gene);
  });

  return variants;
}

// ─── Pathway convergence detection ──────────────────────────────

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 5, high: 4, moderate: 3, low: 2,
  protective: -2, carrier: 1, informational: 0,
};

const MAX_VARIANTS_PER_GENE = 3; // cap to prevent single-gene inflation (e.g. ABCB1)

function matchVariantToPathway(v: MatchedVariant, def: PathwayDefinition): boolean {
  // Primary: tag-based matching
  if (v.tags?.some((t) => def.tags.includes(t))) return true;
  // Fallback: keyword / gene / category matching
  const condLower = v.condition.toLowerCase();
  const geneLower = v.gene.toLowerCase();
  const matchesKeyword = def.keywords.some((k) => condLower.includes(k));
  const matchesGene = def.genePatterns.some(
    (p) => v.gene.startsWith(p) || geneLower.includes(p.toLowerCase())
  );
  const matchesCategory = def.categories.includes(v.category as any);
  return matchesKeyword || matchesGene || matchesCategory;
}

function calculatePathwayScore(variants: MatchedVariant[], def: PathwayDefinition): number {
  // Cap per-gene contribution to prevent inflation
  const geneGroups = new Map<string, MatchedVariant[]>();
  for (const v of variants) {
    const group = geneGroups.get(v.gene) ?? [];
    group.push(v);
    geneGroups.set(v.gene, group);
  }

  let rawScore = 0;
  for (const [, group] of geneGroups) {
    const sorted = [...group].sort(
      (a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0)
    );
    for (const v of sorted.slice(0, MAX_VARIANTS_PER_GENE)) {
      let vScore = SEVERITY_WEIGHT[v.severity] ?? 1;
      if (v.riskAlleleCount === 2) vScore *= def.homozygousPenalty;
      rawScore += vScore;
    }
  }

  // Synergy bonus for multi-gene hits
  const distinctGenes = geneGroups.size;
  const synergyBonus = Math.pow(def.synergyMultiplier, Math.max(0, distinctGenes - 1));
  rawScore *= synergyBonus;

  // Normalize to 0-100 via sigmoid
  return Math.round(100 / (1 + Math.exp(-0.3 * (rawScore - 10))));
}

function findCompoundEffects(variants: MatchedVariant[], def: PathwayDefinition): string[] {
  const geneSet = new Set(variants.map((v) => v.gene));
  const effects: string[] = [];

  for (const [pair, description] of Object.entries(def.interactionNotes)) {
    const [gene1, gene2] = pair.split("+");
    const has1 = [...geneSet].some((g) => g === gene1 || g.startsWith(gene1) || gene1.startsWith(g));
    const has2 = [...geneSet].some((g) => g === gene2 || g.startsWith(gene2) || gene2.startsWith(g));
    if (has1 && has2) {
      effects.push(description);
    }
  }

  return effects;
}

function fillNarrative(
  template: string,
  variants: MatchedVariant[],
  score: number,
  riskLevel: string,
  compoundEffects: string[],
  involvedGenes: string[]
): string {
  const homCount = variants.filter((v) => v.riskAlleleCount === 2).length;
  const effectsText = compoundEffects.length > 0
    ? compoundEffects.map((e) => `Notably, ${e.charAt(0).toLowerCase()}${e.slice(1)}`).join(" ") + " "
    : "";

  return template
    .replace(/\{\{variantCount\}\}/g, String(variants.length))
    .replace(/\{\{homCount\}\}/g, String(homCount))
    .replace(/\{\{geneList\}\}/g, involvedGenes.join(", "))
    .replace(/\{\{synergyScore\}\}/g, String(score))
    .replace(/\{\{riskLabel\}\}/g, riskLevel)
    .replace(/\{\{compoundEffects\}\}/g, effectsText);
}

function generatePlainEnglishAssessment(
  pathwayName: string,
  matchingCount: number,
  homRisk: number,
  riskLevel: PathwayConvergence["riskLevel"]
): string {
  const levelText: Record<string, string> = {
    high: "a higher-than-average",
    elevated: "a moderately elevated",
    moderate: "a slightly elevated",
    low: "a typical",
  };
  const qualifier = levelText[riskLevel] ?? "a notable";
  const homNote = homRisk > 0 ? ` (${homRisk} in both copies of the gene)` : "";
  return `Your DNA shows ${qualifier} genetic predisposition for ${pathwayName.toLowerCase()}, based on ${matchingCount} relevant variant${matchingCount !== 1 ? "s" : ""}${homNote}.`;
}

export function detectPathways(variants: MatchedVariant[]): PathwayConvergence[] {
  const riskVariants = variants.filter((v) => v.riskAlleleCount !== 0);

  const pathways = PATHWAY_DEFINITIONS.map((def) => {
    const matching = riskVariants.filter((v) => matchVariantToPathway(v, def));
    if (matching.length === 0) return null;

    const homRisk = matching.filter((v) => v.riskAlleleCount === 2).length;
    const synergyScore = calculatePathwayScore(matching, def);
    const involvedGenes = [...new Set(matching.map((v) => v.gene))];
    const compoundEffects = findCompoundEffects(matching, def);

    const riskLevel: PathwayConvergence["riskLevel"] =
      synergyScore >= 75 ? "high" :
      synergyScore >= 55 ? "elevated" :
      synergyScore >= 40 ? "moderate" : "low";

    const narrative = fillNarrative(
      def.narrativeTemplate, matching, synergyScore, riskLevel, compoundEffects, involvedGenes
    );

    return {
      name: def.name,
      slug: def.slug,
      variants: matching,
      assessment: generatePlainEnglishAssessment(def.name, matching.length, homRisk, riskLevel),
      riskLevel,
      actions: [],
      synergyScore,
      compoundEffects,
      narrative,
      involvedGenes,
    } satisfies PathwayConvergence;
  }).filter(Boolean) as PathwayConvergence[];

  // Sort by synergy score descending
  pathways.sort((a, b) => b.synergyScore - a.synergyScore);

  return pathways;
}

// ─── Action item generation ─────────────────────────────────────

const RISK_LEVEL_RANK: Record<string, number> = {
  high: 3, elevated: 2, moderate: 1, low: 0,
};

export function generateActionItems(
  variants: MatchedVariant[],
  pathways: PathwayConvergence[],
  apoe: ApoeGenotype,
  prs?: PrsResult
): ActionItem[] {
  const items: ActionItem[] = [];

  // Track which slugs already have pathway-based actions to avoid duplicates with PRS
  const pathwayActionSlugs = new Set<string>();

  // Data-driven actions from pathway definitions
  for (const p of pathways) {
    const pathwayDef = PATHWAY_DEFINITIONS.find((d) => d.slug === p.slug);
    if (!pathwayDef) continue;

    pathwayActionSlugs.add(p.slug);
    const pRank = RISK_LEVEL_RANK[p.riskLevel] ?? 0;
    for (const tmpl of pathwayDef.actionTemplates) {
      const minRank = RISK_LEVEL_RANK[tmpl.minRiskLevel] ?? 0;
      if (pRank >= minRank) {
        items.push({
          priority: tmpl.priority,
          category: tmpl.category,
          title: tmpl.title,
          detail: tmpl.detail,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
        // Also populate the pathway's actions list
        p.actions.push(tmpl.title);
      }
    }

    // Additional actions for pathways not covered by templates
    if (p.riskLevel === "high" || p.riskLevel === "elevated") {
      if (p.slug === "amd") {
        items.push({
          priority: "recommended",
          category: "screening",
          title: "Comprehensive dilated eye examination",
          detail: `${p.variants.length} AMD-related risk variants. Annual retinal screening recommended. Consider AREDS2 supplement formula.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
      if (p.slug === "methylation") {
        items.push({
          priority: "recommended",
          category: "supplement",
          title: "Consider methylfolate supplementation",
          detail: `MTHFR/methylation pathway variants detected. Check homocysteine levels. Use methylfolate (5-MTHF) instead of folic acid if MTHFR variants are present.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
      if (p.slug === "liver") {
        items.push({
          priority: "recommended",
          category: "monitoring",
          title: "Liver function monitoring",
          detail: `Hepatic risk variants detected. Regular liver enzyme panel (ALT, AST, GGT) recommended. Minimize alcohol and monitor for NAFLD.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
    }
  }

  // General lifestyle action when multiple pathways are elevated
  const elevatedCount = pathways.filter((p) => p.riskLevel === "high" || p.riskLevel === "elevated").length;
  if (elevatedCount >= 3) {
    items.push({
      priority: "recommended",
      category: "lifestyle",
      title: "Comprehensive lifestyle risk reduction",
      detail: `Elevated genetic risk across ${elevatedCount} pathways. Mediterranean diet, regular aerobic exercise (150+ min/week), stress management, and adequate sleep are especially important given your genetic profile.`,
      relatedVariants: [],
    });
  }

  // PRS-based action items (only if pathway didn't already cover it)
  if (prs) {
    for (const trait of prs.traits) {
      if (trait.percentile < 80) continue;
      // Map PRS trait IDs to pathway slugs for dedup
      if (pathwayActionSlugs.has(trait.traitId)) continue;

      const ordinal = `${Math.round(trait.percentile)}${ordinalSuffix(Math.round(trait.percentile))}`;
      if (trait.traitId === "cad") {
        items.push({
          priority: "urgent",
          category: "screening",
          title: "Coronary artery calcium (CAC) score — elevated PRS",
          detail: `Polygenic risk score for CAD is in the ${ordinal} percentile (${trait.riskCategory}). Comprehensive lipid panel with Lp(a) and apoB recommended.`,
          relatedVariants: trait.topContributors.map((c) => c.rsid),
        });
      }
      if (trait.traitId === "t2d") {
        items.push({
          priority: "recommended",
          category: "screening",
          title: "Fasting glucose and HbA1c — elevated PRS",
          detail: `Polygenic risk score for T2D is in the ${ordinal} percentile (${trait.riskCategory}). Regular metabolic monitoring recommended.`,
          relatedVariants: trait.topContributors.map((c) => c.rsid),
        });
      }
      if (trait.traitId === "autoimmune") {
        items.push({
          priority: "recommended",
          category: "monitoring",
          title: "Monitor for autoimmune symptoms — elevated PRS",
          detail: `Polygenic risk score for autoimmune conditions is in the ${ordinal} percentile (${trait.riskCategory}). Discuss with physician if symptoms arise.`,
          relatedVariants: trait.topContributors.map((c) => c.rsid),
        });
      }
    }
  }

  // Pharmacogenomics alerts
  const pharmaVariants = variants.filter(
    (v) => v.category === "pharmacogenomics" && v.riskAlleleCount !== 0
  );
  if (pharmaVariants.length > 0) {
    items.push({
      priority: "urgent",
      category: "pharmacogenomics",
      title: "Create pharmacist alert card",
      detail: `${pharmaVariants.length} pharmacogenomic variant(s) affect drug metabolism. Carry this information with you.`,
      relatedVariants: pharmaVariants.map((v) => v.rsid),
    });
  }

  // APOE-specific (not pathway-driven)
  if (apoe.riskLevel === "elevated" || apoe.riskLevel === "high") {
    items.push({
      priority: "urgent",
      category: "screening",
      title: "Discuss APOE status with physician",
      detail: `APOE ${apoe.diplotype} — ${apoe.explanation}`,
      relatedVariants: ["rs429358", "rs7412"],
    });
  }

  return items;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ─── Executive summary generation ────────────────────────────────

function generateExecutiveSummary(
  apoe: ApoeGenotype,
  pathways: PathwayConvergence[],
  actionItems: ActionItem[],
  pharmaVariants: MatchedVariant[],
  prs?: PrsResult
): string[] {
  const bullets: string[] = [];

  // APOE status if notable
  if (apoe.riskLevel === "elevated" || apoe.riskLevel === "high") {
    bullets.push(`APOE ${apoe.diplotype}: ${apoe.explanation.split(".")[0]}.`);
  }

  // Top pathways by risk level
  const highPathways = pathways.filter((p) => p.riskLevel === "high" || p.riskLevel === "elevated");
  if (highPathways.length > 0) {
    const names = highPathways.map((p) => p.name).join(", ");
    bullets.push(`Elevated genetic risk identified in: ${names}.`);
  }

  // Pharmacogenomics highlight
  if (pharmaVariants.length > 0) {
    bullets.push(`${pharmaVariants.length} pharmacogenomic variant(s) affect drug metabolism — carry this information to all medical appointments.`);
  }

  // Urgent action count
  const urgentCount = actionItems.filter((a) => a.priority === "urgent").length;
  if (urgentCount > 0) {
    bullets.push(`${urgentCount} urgent action item${urgentCount > 1 ? "s" : ""} requiring clinical follow-up.`);
  }

  // PRS highlights (only if sufficient data)
  if (prs) {
    const highPrs = prs.traits.filter((t) => t.riskCategory !== "insufficient" && t.percentile >= 80);
    for (const t of highPrs) {
      bullets.push(`Polygenic risk for ${t.traitName}: ${Math.round(t.percentile)}th percentile.`);
    }
  }

  return bullets;
}

// ─── Main analysis entry point ──────────────────────────────────

export function analyse(
  genome: ParsedGenome,
  database: SnpDatabase,
  config?: Partial<GenomicReportConfig>
): AnalysisResult {
  const apoe = determineApoe(genome);
  let variants = crossReference(genome, database);

  // Apply filters
  if (config?.filters?.onlyRiskAlleles) {
    variants = variants.filter((v) => v.riskAlleleCount > 0 || v.riskAlleleCount === -1);
  }

  const pathways = detectPathways(variants);
  const pharmacogenomics = buildDrugGeneMatrix(genome, variants);

  // PRS computation (enabled by default)
  let prs: PrsResult | undefined;
  if (config?.prs?.enabled !== false) {
    try {
      prs = computeAllPrs(genome, database, config?.prs);
    } catch {
      // PRS is optional — don't fail the entire analysis if scoring files are missing
    }
  }

  const actionItems = generateActionItems(variants, pathways, apoe, prs);

  const pharmaVariants = variants.filter(
    (v) => v.category === "pharmacogenomics" && v.riskAlleleCount !== 0
  );
  const executiveSummary = generateExecutiveSummary(apoe, pathways, actionItems, pharmaVariants, prs);

  return {
    inputFile: config?.input?.filePath ?? "unknown",
    inputFormat: genome.format,
    buildVersion: genome.buildVersion,
    totalSnps: genome.totalSnps,
    matchedCount: variants.length,
    analysisDate: new Date().toISOString().split("T")[0],
    apoe,
    variants,
    pathways,
    actionItems,
    pharmacogenomics,
    prs,
    executiveSummary,
  };
}
