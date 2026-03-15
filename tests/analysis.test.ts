import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse23andMe } from "../src/parsers/twentythree-and-me.js";
import { crossReference, determineApoe, detectPathways } from "../src/analysis/engine.js";
import type { SnpDatabase, ParsedGenome } from "../src/types.js";

const TMP = join(tmpdir(), "genomic-report-tests");
try { mkdirSync(TMP, { recursive: true }); } catch {}

// Minimal test database
const TEST_DB: SnpDatabase = {
  version: "test",
  lastUpdated: "2026-01-01",
  entries: [
    {
      rsid: "rs429358",
      gene: "APOE",
      riskAllele: "C",
      condition: "APOE4 — Alzheimer's disease",
      category: "neurological",
      severity: "critical",
      evidenceLevel: "Definitive",
      oddsRatio: "3.7 per e4 allele",
      notes: "Combined with rs7412 determines APOE genotype.",
    },
    {
      rsid: "rs7412",
      gene: "APOE",
      riskAllele: "C",
      condition: "APOE genotype determination",
      category: "neurological",
      severity: "critical",
      evidenceLevel: "Definitive",
      notes: "TT=e2, CC=e3/e4.",
    },
    {
      rsid: "rs1799853",
      gene: "CYP2C9",
      riskAllele: "T",
      condition: "CYP2C9*2 — warfarin sensitivity",
      category: "pharmacogenomics",
      severity: "critical",
      evidenceLevel: "PharmGKB Level 1A",
      notes: "Reduced warfarin clearance.",
    },
    {
      rsid: "rs4680",
      gene: "COMT",
      riskAllele: "A",
      condition: "COMT Val158Met — catecholamine metabolism",
      category: "pharmacogenomics",
      severity: "moderate",
      evidenceLevel: "Large GWAS",
      notes: "Met/Met = slower dopamine clearance.",
    },
    {
      rsid: "rs9999999",
      gene: "FAKE",
      riskAllele: "G",
      condition: "Not in genome file",
      category: "other",
      severity: "low",
      evidenceLevel: "None",
      notes: "Should not match.",
    },
  ],
};

function makeTestGenome(): ParsedGenome {
  const data = `# test file build 37
# rsid\tchromosome\tposition\tgenotype
rs429358\t19\t45411941\tTT
rs7412\t19\t45412079\tCC
rs1799853\t10\t96702047\tCT
rs4680\t22\t19951271\tAA
rs999000\t1\t100\tGG
`;
  const path = join(TMP, "analysis-test.txt");
  writeFileSync(path, data);
  return parse23andMe(path);
}

describe("Cross-reference engine", () => {
  it("matches known variants and skips missing ones", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);

    // Should match 4 (rs429358, rs7412, rs1799853, rs4680) but not rs9999999
    expect(variants.length).toBe(4);
    expect(variants.find((v) => v.rsid === "rs9999999")).toBeUndefined();
  });

  it("correctly counts risk alleles", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);

    // rs1799853 CT, risk allele T → 1 copy
    const cyp = variants.find((v) => v.rsid === "rs1799853")!;
    expect(cyp.riskAlleleCount).toBe(1);
    expect(cyp.zygosity).toBe("heterozygous");

    // rs4680 AA, risk allele A → 2 copies
    const comt = variants.find((v) => v.rsid === "rs4680")!;
    expect(comt.riskAlleleCount).toBe(2);
    expect(comt.zygosity).toBe("homozygous");

    // rs429358 TT, risk allele C → 0 copies
    const apoe429 = variants.find((v) => v.rsid === "rs429358")!;
    expect(apoe429.riskAlleleCount).toBe(0);
  });

  it("sorts results by severity", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);

    // Critical variants should come first
    expect(variants[0].severity).toBe("critical");
    const lastCritIdx = variants.findLastIndex((v) => v.severity === "critical");
    const firstModIdx = variants.findIndex((v) => v.severity === "moderate");
    expect(lastCritIdx).toBeLessThan(firstModIdx);
  });
});

describe("APOE determination", () => {
  it("determines e3/e3 correctly", () => {
    const genome = makeTestGenome(); // rs429358=TT, rs7412=CC
    const apoe = determineApoe(genome);

    expect(apoe.diplotype).toBe("e3/e3");
    expect(apoe.riskLevel).toBe("average");
  });

  it("handles missing SNPs gracefully", () => {
    const data = `# test\nrs999\t1\t100\tAA\n`;
    const path = join(TMP, "apoe-missing.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);

    const apoe = determineApoe(genome);
    expect(apoe.diplotype).toContain("Undetermined");
  });
});

describe("Pathway convergence", () => {
  it("groups variants into pathways", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const pathways = detectPathways(variants);

    // Should detect pharmacogenomics pathway (CYP2C9 + COMT)
    const pharma = pathways.find((p) => p.slug === "pharma");
    expect(pharma).toBeDefined();
    expect(pharma!.variants.length).toBeGreaterThanOrEqual(1);
  });
});
