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
  GenomicReportConfig,
  PrsResult,
} from "../types.js";
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

const PATHWAY_DEFINITIONS = [
  {
    name: "Coronary Artery Disease / Atherosclerosis",
    slug: "cad",
    keywords: ["coronary", "cad", "ldl", "cholesterol", "atherosclerosis", "myocardial", "9p21"],
    categories: ["cardiovascular"] as string[],
    genePatterns: ["9p21", "SORT1", "PCSK9", "LDLR", "LPA", "CXCL12", "MIA3", "WDR12", "MTHFD1L"],
  },
  {
    name: "Atrial Fibrillation",
    slug: "af",
    keywords: ["atrial fibrillation"],
    categories: ["cardiovascular"],
    genePatterns: ["PITX2", "4q25", "KCNN3", "ZFHX3"],
  },
  {
    name: "Type 2 Diabetes / Metabolic Syndrome",
    slug: "t2d",
    keywords: ["diabetes", "obesity", "bmi", "insulin", "metabolic"],
    categories: ["metabolic"],
    genePatterns: ["TCF7L2", "FTO", "MC4R", "KCNJ11", "PPARG", "SLC30A8", "CDKAL1", "IGF2BP2"],
  },
  {
    name: "Autoimmune / Inflammatory",
    slug: "autoimmune",
    keywords: ["autoimmune", "rheumatoid", "crohn", "celiac", "psoriasis", "lupus", "inflammatory"],
    categories: ["autoimmune"],
    genePatterns: ["HLA-", "PTPN22", "CTLA4", "IL23R", "ATG16L1", "NOD2", "IL2RA"],
  },
  {
    name: "Macular Degeneration / Vision",
    slug: "amd",
    keywords: ["macular", "glaucoma", "amd", "vision"],
    categories: ["ophthalmological"],
    genePatterns: ["CFH", "ARMS2", "HTRA1", "C3", "VEGFA"],
  },
  {
    name: "Liver / Hepatic",
    slug: "liver",
    keywords: ["liver", "nafld", "nash", "hepatic", "gilbert"],
    categories: ["hepatic"],
    genePatterns: ["PNPLA3", "TM6SF2", "UGT1A1"],
  },
  {
    name: "Methylation / Folate Metabolism",
    slug: "methylation",
    keywords: ["folate", "methylation", "homocysteine", "mthfr"],
    categories: ["nutrigenomic"],
    genePatterns: ["MTHFR", "MTHFD1L", "MTR", "MTRR", "COMT"],
  },
  {
    name: "Pharmacogenomics",
    slug: "pharma",
    keywords: ["metabolizer", "drug", "warfarin", "statin"],
    categories: ["pharmacogenomics"],
    genePatterns: ["CYP", "SLCO", "DPYD", "TPMT", "UGT1A1", "ABCB1", "HLA-"],
  },
];

export function detectPathways(variants: MatchedVariant[]): PathwayConvergence[] {
  const riskVariants = variants.filter((v) => v.riskAlleleCount !== 0);

  return PATHWAY_DEFINITIONS.map((def) => {
    const matching = riskVariants.filter((v) => {
      const condLower = v.condition.toLowerCase();
      const geneLower = v.gene.toLowerCase();
      const matchesKeyword = def.keywords.some((k) => condLower.includes(k));
      const matchesGene = def.genePatterns.some(
        (p) => v.gene.startsWith(p) || geneLower.includes(p.toLowerCase())
      );
      const matchesCategory = def.categories.includes(v.category);
      return matchesKeyword || matchesGene || matchesCategory;
    });

    if (matching.length === 0) return null;

    const homRisk = matching.filter((v) => v.riskAlleleCount === 2).length;
    const riskLevel: PathwayConvergence["riskLevel"] =
      matching.length >= 6 || homRisk >= 2 ? "high" :
      matching.length >= 3 || homRisk >= 1 ? "elevated" :
      matching.length >= 2 ? "moderate" : "low";

    return {
      name: def.name,
      slug: def.slug,
      variants: matching,
      assessment: `${matching.length} risk variant(s) identified, ${homRisk} homozygous.`,
      riskLevel,
      actions: [], // populated by action generator or report module
    } satisfies PathwayConvergence;
  }).filter(Boolean) as PathwayConvergence[];
}

// ─── Action item generation ─────────────────────────────────────

export function generateActionItems(
  variants: MatchedVariant[],
  pathways: PathwayConvergence[],
  apoe: ApoeGenotype,
  prs?: PrsResult
): ActionItem[] {
  const items: ActionItem[] = [];

  // Track which slugs already have pathway-based actions to avoid duplicates with PRS
  const pathwayActionSlugs = new Set<string>();

  // Screening based on pathways
  for (const p of pathways) {
    if (p.riskLevel === "high" || p.riskLevel === "elevated") {
      pathwayActionSlugs.add(p.slug);
      if (p.slug === "cad") {
        items.push({
          priority: "urgent",
          category: "screening",
          title: "Coronary artery calcium (CAC) score",
          detail: `${p.variants.length} CAD-related risk variants identified. Comprehensive lipid panel with Lp(a) and apoB also recommended.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
      if (p.slug === "af") {
        items.push({
          priority: "urgent",
          category: "screening",
          title: "Baseline ECG and consider Holter monitoring",
          detail: `Elevated genetic AF risk. Alert for palpitations, irregular pulse. Moderate alcohol.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
      if (p.slug === "t2d") {
        items.push({
          priority: "recommended",
          category: "screening",
          title: "Fasting glucose and HbA1c",
          detail: `${p.variants.length} T2D-related risk variants. Monitor metabolic markers regularly.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
      if (p.slug === "autoimmune") {
        items.push({
          priority: "recommended",
          category: "monitoring",
          title: "Monitor for autoimmune symptoms",
          detail: `High autoimmune genetic loading. Anti-CCP/RF if joint symptoms; GI workup if IBD symptoms.`,
          relatedVariants: p.variants.map((v) => v.rsid),
        });
      }
    }
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

  // APOE-specific
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
    prs,
  };
}
