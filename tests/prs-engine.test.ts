import { describe, it, expect } from "vitest";
import type { ParsedGenome, PgsScoringFile, SnpDatabase } from "../src/types.js";
import {
  normalCdf,
  complementBase,
  countEffectAlleles,
  categorizePercentile,
  computePrs,
} from "../src/analysis/prs-engine.js";

// ── Helpers ──────────────────────────────────────────────────────

function makeSyntheticGenome(snps: Record<string, string>): ParsedGenome {
  const map = new Map<string, { rsid: string; chromosome: string; position: number; genotype: string }>();
  for (const [rsid, genotype] of Object.entries(snps)) {
    map.set(rsid, { rsid, chromosome: "1", position: 100, genotype });
  }
  return {
    format: "23andme",
    buildVersion: "GRCh37",
    totalSnps: map.size,
    snps: map,
    metadata: {},
  };
}

function makeScoringFile(
  variants: Array<{ rsid: string; effectAllele: string; otherAllele: string; effectWeight: number }>,
  populationMean: number,
  populationSd: number,
): PgsScoringFile {
  return {
    pgsId: "PGS_TEST",
    traitName: "Test Trait",
    traitId: "test",
    genomeBuild: "GRCh37",
    totalVariantsOriginal: 10000,
    totalVariantsCurated: variants.length,
    populationParams: {
      source: "Synthetic",
      ancestry: "EUR",
      mean: populationMean,
      sd: populationSd,
      sampleSize: 100000,
    },
    variants: variants.map((v, i) => ({
      ...v,
      chr: "1",
      pos: 1000 + i * 100,
    })),
  };
}

const TEST_SNP_DB: SnpDatabase = {
  version: "test",
  lastUpdated: "2026-01-01",
  entries: [
    { rsid: "rs1", gene: "GENE1", riskAllele: "A", condition: "test", category: "other", severity: "low", evidenceLevel: "test", notes: "" },
    { rsid: "rs2", gene: "GENE2", riskAllele: "G", condition: "test", category: "other", severity: "low", evidenceLevel: "test", notes: "" },
  ],
};

// ── normalCdf ────────────────────────────────────────────────────

describe("normalCdf", () => {
  it("returns ~0.5 for z=0", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 4);
  });

  it("returns ~0.8413 for z=1", () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
  });

  it("returns ~0.1587 for z=-1", () => {
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("returns ~0.9772 for z=2", () => {
    expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
  });

  it("returns ~0.0228 for z=-2", () => {
    expect(normalCdf(-2)).toBeCloseTo(0.0228, 3);
  });

  it("clamps extreme values", () => {
    expect(normalCdf(-10)).toBe(0);
    expect(normalCdf(10)).toBe(1);
  });
});

// ── complementBase ───────────────────────────────────────────────

describe("complementBase", () => {
  it("returns correct complements", () => {
    expect(complementBase("A")).toBe("T");
    expect(complementBase("T")).toBe("A");
    expect(complementBase("C")).toBe("G");
    expect(complementBase("G")).toBe("C");
  });

  it("returns input for invalid bases", () => {
    expect(complementBase("X")).toBe("X");
  });
});

// ── countEffectAlleles ───────────────────────────────────────────

describe("countEffectAlleles", () => {
  it("counts homozygous effect allele", () => {
    expect(countEffectAlleles("AA", "A", "G")).toBe(2);
  });

  it("counts heterozygous", () => {
    expect(countEffectAlleles("AG", "A", "G")).toBe(1);
  });

  it("counts zero when no effect allele present", () => {
    expect(countEffectAlleles("GG", "A", "G")).toBe(0);
  });

  it("handles strand flips", () => {
    // Genotype on opposite strand: TT instead of AA
    // Effect allele A (complement T), Other allele G (complement C)
    expect(countEffectAlleles("TT", "A", "G")).toBe(2);
    expect(countEffectAlleles("TC", "A", "G")).toBe(1);
    expect(countEffectAlleles("CC", "A", "G")).toBe(0);
  });

  it("returns -1 for unresolvable alleles", () => {
    expect(countEffectAlleles("--", "A", "G")).toBe(-1);
  });
});

// ── categorizePercentile ─────────────────────────────────────────

describe("categorizePercentile", () => {
  it("categorizes low (<20)", () => {
    expect(categorizePercentile(5)).toBe("low");
    expect(categorizePercentile(19.9)).toBe("low");
  });

  it("categorizes average (20-59)", () => {
    expect(categorizePercentile(20)).toBe("average");
    expect(categorizePercentile(50)).toBe("average");
  });

  it("categorizes above-average (60-79)", () => {
    expect(categorizePercentile(60)).toBe("above-average");
    expect(categorizePercentile(79)).toBe("above-average");
  });

  it("categorizes elevated (80-94)", () => {
    expect(categorizePercentile(80)).toBe("elevated");
    expect(categorizePercentile(94)).toBe("elevated");
  });

  it("categorizes high (>=95)", () => {
    expect(categorizePercentile(95)).toBe("high");
    expect(categorizePercentile(99.9)).toBe("high");
  });
});

// ── computePrs ──────────────────────────────────────────────────

describe("computePrs", () => {
  it("computes correct raw score for known genotypes", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA", // dosage 2 for effect allele A
      rs2: "AG", // dosage 1 for effect allele A
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.1 },
      { rsid: "rs2", effectAllele: "A", otherAllele: "G", effectWeight: 0.2 },
    ], 0.3, 0.1);

    const result = computePrs(genome, scoring);

    // rawScore = (0.1 * 2) + (0.2 * 1) = 0.4
    expect(result.rawScore).toBeCloseTo(0.4, 6);
  });

  it("computes correct z-score and percentile", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA",
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.5 },
    ], 0.5, 0.25);

    const result = computePrs(genome, scoring);

    // rawScore = 0.5 * 2 = 1.0
    // zScore = (1.0 - 0.5) / 0.25 = 2.0
    // percentile ≈ 97.7
    expect(result.rawScore).toBeCloseTo(1.0, 6);
    expect(result.zScore).toBeCloseTo(2.0, 4);
    expect(result.percentile).toBeCloseTo(97.7, 0);
    expect(result.riskCategory).toBe("high");
  });

  it("handles missing variants correctly", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA",
      // rs2 missing, rs3 missing
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.1 },
      { rsid: "rs2", effectAllele: "C", otherAllele: "T", effectWeight: 0.2 },
      { rsid: "rs3", effectAllele: "G", otherAllele: "A", effectWeight: 0.3 },
    ], 0.0, 0.1);

    const result = computePrs(genome, scoring);

    expect(result.variantsUsed).toBe(1);
    expect(result.variantsTotal).toBe(3);
    expect(result.coveragePct).toBeCloseTo(33.33, 1);
  });

  it("skips no-call genotypes", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA",
      rs2: "--",
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.1 },
      { rsid: "rs2", effectAllele: "C", otherAllele: "T", effectWeight: 0.2 },
    ], 0.0, 0.1);

    const result = computePrs(genome, scoring);
    expect(result.variantsUsed).toBe(1);
  });

  it("extracts top contributors sorted by absolute contribution", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA", // dosage 2, contrib = 0.02
      rs2: "AG", // dosage 1, contrib = 0.5
      rs3: "GG", // dosage 2, contrib = -0.6
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.01 },
      { rsid: "rs2", effectAllele: "A", otherAllele: "G", effectWeight: 0.5 },
      { rsid: "rs3", effectAllele: "G", otherAllele: "A", effectWeight: -0.3 },
    ], 0.0, 1.0);

    const result = computePrs(genome, scoring);

    // Top contributor should be rs3 (|contribution| = 0.6) or rs2 (0.5)
    expect(result.topContributors[0].rsid).toBe("rs3");
    expect(result.topContributors[1].rsid).toBe("rs2");
  });

  it("cross-references gene names from SNP database", () => {
    const genome = makeSyntheticGenome({
      rs1: "AA",
      rs2: "GG",
    });

    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.5 },
      { rsid: "rs2", effectAllele: "G", otherAllele: "A", effectWeight: 0.3 },
    ], 0.0, 1.0);

    const result = computePrs(genome, scoring, TEST_SNP_DB);

    const rs1Contrib = result.topContributors.find((c) => c.rsid === "rs1");
    expect(rs1Contrib?.gene).toBe("GENE1");
  });

  it("generates interpretation text", () => {
    const genome = makeSyntheticGenome({ rs1: "AA" });
    const scoring = makeScoringFile([
      { rsid: "rs1", effectAllele: "A", otherAllele: "G", effectWeight: 0.5 },
    ], 0.5, 0.25);

    const result = computePrs(genome, scoring);
    expect(result.interpretation).toBeTruthy();
    expect(result.interpretation.length).toBeGreaterThan(20);
  });
});
