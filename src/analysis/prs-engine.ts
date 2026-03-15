import type {
  ParsedGenome,
  PgsScoringFile,
  PrsTraitResult,
  PrsResult,
  PrsRiskCategory,
  PrsContributor,
  PrsConfig,
  SnpDatabase,
} from "../types.js";
import { loadAllPgsScoringFiles } from "../database/pgs-loader.js";

// ─── Normal CDF (Abramowitz & Stegun approximation) ─────────────

export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

// ─── DNA complement (strand flip) ───────────────────────────────

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };

export function complementBase(base: string): string {
  return COMPLEMENT[base] ?? base;
}

// ─── Effect allele counting ─────────────────────────────────────

export function countEffectAlleles(
  genotype: string,
  effectAllele: string,
  otherAllele: string,
): number {
  if (genotype === "--" || genotype === "00" || genotype.length < 1) return -1;

  const alleles = genotype.split("");

  // Direct match: check if genotype alleles match effect/other alleles
  const allGenotypeAlleles = new Set(alleles);
  const directMatch =
    allGenotypeAlleles.has(effectAllele) || allGenotypeAlleles.has(otherAllele);

  if (directMatch) {
    return alleles.filter((a) => a === effectAllele).length;
  }

  // Strand flip: try complements
  const compEffect = complementBase(effectAllele);
  const compOther = complementBase(otherAllele);
  const strandMatch =
    allGenotypeAlleles.has(compEffect) || allGenotypeAlleles.has(compOther);

  if (strandMatch) {
    return alleles.filter((a) => a === compEffect).length;
  }

  return -1;
}

// ─── Risk categorization ────────────────────────────────────────

export function categorizePercentile(percentile: number): PrsRiskCategory {
  if (percentile >= 95) return "high";
  if (percentile >= 80) return "elevated";
  if (percentile >= 60) return "above-average";
  if (percentile >= 20) return "average";
  return "low";
}

// ─── Interpretation text ────────────────────────────────────────

function generateInterpretation(
  traitName: string,
  percentile: number,
  riskCategory: PrsRiskCategory,
): string {
  const pct = Math.round(percentile);
  const ordinal = `${pct}${ordinalSuffix(pct)}`;
  const abovePct = 100 - pct;

  switch (riskCategory) {
    case "high":
      return `Your polygenic risk score for ${traitName} places you in the ${ordinal} percentile (high risk). Only approximately ${abovePct}% of the European-ancestry reference population has a higher genetic predisposition. This is a significant finding that should be discussed with your healthcare provider for appropriate screening and prevention strategies.`;
    case "elevated":
      return `Your polygenic risk score for ${traitName} places you in the ${ordinal} percentile (elevated risk). Approximately ${abovePct}% of the European-ancestry reference population has a higher genetic predisposition. Consider discussing targeted screening with your healthcare provider.`;
    case "above-average":
      return `Your polygenic risk score for ${traitName} places you in the ${ordinal} percentile (above average). Approximately ${abovePct}% of the European-ancestry reference population has a higher genetic predisposition. Standard screening guidelines apply, with attention to modifiable risk factors.`;
    case "average":
      return `Your polygenic risk score for ${traitName} places you in the ${ordinal} percentile, which is within the average range. Standard age-appropriate screening guidelines apply.`;
    case "low":
      return `Your polygenic risk score for ${traitName} places you in the ${ordinal} percentile (below average genetic risk). While your genetic predisposition is lower than most, lifestyle and environmental factors still play an important role.`;
  }
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ─── Core PRS computation (single trait) ────────────────────────

export function computePrs(
  genome: ParsedGenome,
  scoringFile: PgsScoringFile,
  snpDatabase?: SnpDatabase,
): PrsTraitResult {
  const contributions: Array<{
    rsid: string;
    effectAllele: string;
    dosage: number;
    contribution: number;
  }> = [];

  let variantsUsed = 0;

  for (const variant of scoringFile.variants) {
    const snp = genome.snps.get(variant.rsid);
    if (!snp) continue;

    const genotype = snp.genotype;
    if (genotype === "--" || genotype === "00") continue;

    const dosage = countEffectAlleles(genotype, variant.effectAllele, variant.otherAllele);
    if (dosage === -1) continue;

    variantsUsed++;
    const contribution = variant.effectWeight * dosage;
    contributions.push({
      rsid: variant.rsid,
      effectAllele: variant.effectAllele,
      dosage,
      contribution,
    });
  }

  const rawScore = contributions.reduce((sum, c) => sum + c.contribution, 0);
  const { mean, sd } = scoringFile.populationParams;
  const zScore = sd > 0 ? (rawScore - mean) / sd : 0;
  const percentile = normalCdf(zScore) * 100;
  const riskCategory = categorizePercentile(percentile);
  const coveragePct = (variantsUsed / scoringFile.variants.length) * 100;

  // Build gene lookup from SNP database
  const geneMap = new Map<string, string>();
  if (snpDatabase) {
    for (const entry of snpDatabase.entries) {
      geneMap.set(entry.rsid, entry.gene);
    }
  }

  // Top 5 contributors by absolute contribution
  const topContributors: PrsContributor[] = contributions
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5)
    .map((c) => ({
      rsid: c.rsid,
      gene: geneMap.get(c.rsid),
      effectAllele: c.effectAllele,
      dosage: c.dosage,
      contribution: c.contribution,
    }));

  return {
    traitId: scoringFile.traitId,
    traitName: scoringFile.traitName,
    pgsId: scoringFile.pgsId,
    rawScore,
    zScore,
    percentile,
    riskCategory,
    variantsUsed,
    variantsTotal: scoringFile.variants.length,
    coveragePct,
    topContributors,
    interpretation: generateInterpretation(scoringFile.traitName, percentile, riskCategory),
  };
}

// ─── Compute PRS for all traits ─────────────────────────────────

export function computeAllPrs(
  genome: ParsedGenome,
  snpDatabase: SnpDatabase,
  config?: PrsConfig,
): PrsResult {
  const scoringFiles = loadAllPgsScoringFiles(
    config?.traits,
    config?.scoringDataPath,
  );

  const traits = scoringFiles.map((sf) => computePrs(genome, sf, snpDatabase));

  const limitations: string[] = [
    "Percentile estimates are based on European-ancestry reference populations and may be less accurate for other ancestries.",
  ];

  for (const t of traits) {
    if (t.coveragePct < 50) {
      limitations.push(
        `Coverage for ${t.traitName} is ${Math.round(t.coveragePct)}% (<50%), which may reduce score accuracy.`,
      );
    }
  }

  return { traits, limitations };
}
