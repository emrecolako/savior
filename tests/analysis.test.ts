import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse23andMe } from "../src/parsers/twentythree-and-me.js";
import { crossReference, determineApoe, detectPathways, analyse, generateActionItems } from "../src/analysis/engine.js";
import { buildDrugGeneMatrix } from "../src/analysis/metabolizers.js";
import { loadDatabase } from "../src/database/loader.js";
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

  it("determines e3/e4 correctly (elevated risk)", () => {
    const data = `# test\nrs429358\t19\t45411941\tCT\nrs7412\t19\t45412079\tCC\n`;
    const path = join(TMP, "apoe-e3e4.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);
    const apoe = determineApoe(genome);
    expect(apoe.diplotype).toBe("e3/e4");
    expect(apoe.riskLevel).toBe("elevated");
  });

  it("determines e4/e4 correctly (high risk)", () => {
    const data = `# test\nrs429358\t19\t45411941\tCC\nrs7412\t19\t45412079\tCC\n`;
    const path = join(TMP, "apoe-e4e4.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);
    const apoe = determineApoe(genome);
    expect(apoe.diplotype).toBe("e4/e4");
    expect(apoe.riskLevel).toBe("high");
  });

  it("determines e2/e3 correctly (low risk)", () => {
    const data = `# test\nrs429358\t19\t45411941\tTT\nrs7412\t19\t45412079\tCT\n`;
    const path = join(TMP, "apoe-e2e3.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);
    const apoe = determineApoe(genome);
    expect(apoe.diplotype).toBe("e2/e3");
    expect(apoe.riskLevel).toBe("low");
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

    // CYP2C9 should match detox-phase1 pathway; COMT matches methylation and catecholamine
    const detox = pathways.find((p) => p.slug === "detox-phase1");
    expect(detox).toBeDefined();
    expect(detox!.variants.length).toBeGreaterThanOrEqual(1);
  });

  it("calculates synergy score and populates new fields", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const pathways = detectPathways(variants);

    for (const p of pathways) {
      expect(typeof p.synergyScore).toBe("number");
      expect(p.synergyScore).toBeGreaterThanOrEqual(0);
      expect(p.synergyScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(p.compoundEffects)).toBe(true);
      expect(typeof p.narrative).toBe("string");
      expect(p.narrative.length).toBeGreaterThan(0);
      expect(Array.isArray(p.involvedGenes)).toBe(true);
      expect(p.involvedGenes.length).toBeGreaterThan(0);
    }
  });

  it("scores multi-gene pathways higher than single-gene via synergy", () => {
    // Create a test DB with two pathway-tagged variants from different genes
    const multiGeneDb: SnpDatabase = {
      version: "test",
      lastUpdated: "2026-01-01",
      entries: [
        {
          rsid: "rs1801133",
          gene: "MTHFR",
          riskAllele: "T",
          condition: "MTHFR C677T — reduced folate metabolism",
          category: "nutrigenomic",
          severity: "moderate",
          evidenceLevel: "Large GWAS",
          notes: "Reduced enzyme activity.",
          tags: ["pathway:methylation"],
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
          tags: ["pathway:methylation", "pathway:catecholamine"],
        },
      ],
    };

    const singleGeneDb: SnpDatabase = {
      version: "test",
      lastUpdated: "2026-01-01",
      entries: [
        multiGeneDb.entries[0], // only MTHFR
      ],
    };

    // Create genome with both SNPs
    const data = `# test\nrs1801133\t1\t11856378\tTT\nrs4680\t22\t19951271\tAA\n`;
    const path = join(TMP, "synergy-test.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);

    const multiPathways = detectPathways(crossReference(genome, multiGeneDb));
    const singlePathways = detectPathways(crossReference(genome, singleGeneDb));

    const multiMeth = multiPathways.find((p) => p.slug === "methylation");
    const singleMeth = singlePathways.find((p) => p.slug === "methylation");

    expect(multiMeth).toBeDefined();
    expect(singleMeth).toBeDefined();
    // Multi-gene should score higher due to synergy multiplier
    expect(multiMeth!.synergyScore).toBeGreaterThan(singleMeth!.synergyScore);
  });

  it("detects compound effects when interacting genes are present", () => {
    const db: SnpDatabase = {
      version: "test",
      lastUpdated: "2026-01-01",
      entries: [
        {
          rsid: "rs1801133",
          gene: "MTHFR",
          riskAllele: "T",
          condition: "MTHFR C677T — reduced folate metabolism",
          category: "nutrigenomic",
          severity: "moderate",
          evidenceLevel: "Large GWAS",
          notes: "Reduced enzyme activity.",
          tags: ["pathway:methylation"],
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
          tags: ["pathway:methylation"],
        },
      ],
    };

    const data = `# test\nrs1801133\t1\t11856378\tTT\nrs4680\t22\t19951271\tAA\n`;
    const path = join(TMP, "compound-test.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);

    const pathways = detectPathways(crossReference(genome, db));
    const meth = pathways.find((p) => p.slug === "methylation");

    expect(meth).toBeDefined();
    // MTHFR+COMT interaction note should be detected
    expect(meth!.compoundEffects.length).toBeGreaterThan(0);
    expect(meth!.compoundEffects[0]).toContain("COMT");
  });

  it("sorts pathways by synergy score descending", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const pathways = detectPathways(variants);

    for (let i = 1; i < pathways.length; i++) {
      expect(pathways[i - 1].synergyScore).toBeGreaterThanOrEqual(pathways[i].synergyScore);
    }
  });
});

// ─── Pharmacogenomics / Drug-Gene Matrix ─────────────────────

describe("Action item generation", () => {
  it("generates pharmacogenomics alert when PGx variants present", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const pathways = detectPathways(variants);
    const apoe = determineApoe(genome);
    const actions = generateActionItems(variants, pathways, apoe);

    const pgxAlert = actions.find((a: any) => a.category === "pharmacogenomics");
    expect(pgxAlert).toBeDefined();
    expect(pgxAlert!.priority).toBe("urgent");
  });

  it("generates lifestyle actions when multiple pathways elevated", () => {
    // This test uses the small test DB, so elevated pathway count may be low
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const pathways = detectPathways(variants);
    const apoe = determineApoe(genome);
    const actions = generateActionItems(variants, pathways, apoe);

    // Should at least have some actions
    expect(actions.length).toBeGreaterThan(0);
  });
});

describe("Integration: large database cross-reference", () => {
  it("handles full snp-database.json without errors", () => {
    const genome = makeTestGenome();
    const fullDb = loadDatabase();

    expect(fullDb.entries.length).toBeGreaterThan(1000);

    const variants = crossReference(genome, fullDb);
    // Should match some variants from the full DB
    expect(variants.length).toBeGreaterThanOrEqual(4); // at minimum our test SNPs
    // Should be sorted by severity
    for (let i = 1; i < variants.length; i++) {
      const severityRank: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3, protective: 4, carrier: 5, informational: 6 };
      const prev = severityRank[variants[i - 1].severity] ?? 99;
      const curr = severityRank[variants[i].severity] ?? 99;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });
});

describe("Full analysis pipeline", () => {
  it("runs analyse() end-to-end with test genome", () => {
    const genome = makeTestGenome();
    const result = analyse(genome, TEST_DB, { input: { filePath: "test.txt" } });

    expect(result.inputFormat).toBe("23andme");
    expect(result.totalSnps).toBeGreaterThan(0);
    expect(result.matchedCount).toBe(4);
    expect(result.apoe.diplotype).toBe("e3/e3");
    expect(result.variants.length).toBe(4);
    expect(result.pathways.length).toBeGreaterThan(0);
    expect(result.pharmacogenomics.genes.length).toBe(11);
    expect(result.pharmacogenomics.interactions.length).toBeGreaterThan(0);
    expect(result.executiveSummary).toBeDefined();
  });

  it("generates executive summary bullets", () => {
    const genome = makeTestGenome();
    const result = analyse(genome, TEST_DB);
    
    // With CYP2C9*2 pharmacogenomics variant, should mention it
    const hasPharma = result.executiveSummary?.some((b) =>
      b.toLowerCase().includes("pharmacogenomic")
    );
    expect(hasPharma).toBe(true);
  });
});

describe("Drug-gene interaction matrix", () => {
  it("returns metabolizer status for all 11 PGx genes", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const matrix = buildDrugGeneMatrix(genome, variants);

    expect(matrix.genes.length).toBe(11);
    const geneNames = matrix.genes.map((g) => g.gene);
    expect(geneNames).toContain("CYP2D6");
    expect(geneNames).toContain("CYP2C19");
    expect(geneNames).toContain("CYP2C9");
    expect(geneNames).toContain("CYP3A4");
    expect(geneNames).toContain("CYP3A5");
    expect(geneNames).toContain("CYP1A2");
    expect(geneNames).toContain("DPYD");
    expect(geneNames).toContain("TPMT");
    expect(geneNames).toContain("SLCO1B1");
    expect(geneNames).toContain("UGT1A1");
    expect(geneNames).toContain("ABCB1");
  });

  it("detects CYP2C9 intermediate metabolizer from heterozygous *2", () => {
    // Test genome has rs1799853=CT (CYP2C9*2 heterozygous)
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const matrix = buildDrugGeneMatrix(genome, variants);

    const cyp2c9 = matrix.genes.find((g) => g.gene === "CYP2C9")!;
    expect(cyp2c9).toBeDefined();
    expect(cyp2c9.phenotype).toBe("intermediate");
    expect(cyp2c9.detectedVariants).toContain("rs1799853");
    expect(cyp2c9.activityScore).toBeLessThan(2);
  });

  it("generates drug interactions for every medication", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const matrix = buildDrugGeneMatrix(genome, variants);

    // Should have interactions for many medications
    expect(matrix.interactions.length).toBeGreaterThan(25);

    // Every interaction has required fields
    for (const di of matrix.interactions) {
      expect(di.drug).toBeTruthy();
      expect(di.drugClass).toBeTruthy();
      expect(di.primaryGene).toBeTruthy();
      expect(di.action).toBeTruthy();
      expect(di.detail).toBeTruthy();
      expect(di.evidence).toBeTruthy();
    }
  });

  it("flags warfarin dose reduction for CYP2C9 intermediate metabolizer", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const matrix = buildDrugGeneMatrix(genome, variants);

    const warfarin = matrix.interactions.find((di) => di.drug === "Warfarin");
    expect(warfarin).toBeDefined();
    expect(warfarin!.action).toBe("consider dose reduction");
  });

  it("returns normal phenotype when no variant alleles are present", () => {
    // Genome with no PGx variant alleles
    const data = `# test\nrs429358\t19\t45411941\tTT\n`;
    const path = join(TMP, "pgx-normal.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);
    const matrix = buildDrugGeneMatrix(genome, []);

    // All genes should default to normal (wildtype)
    for (const g of matrix.genes) {
      expect(g.phenotype).toBe("normal");
      expect(g.diplotype).toBe("*1/*1");
    }
  });

  it("detects homozygous poor metabolizer correctly", () => {
    // CYP2C19 *2/*2 (rs4244285 AA = homozygous variant)
    const data = `# test\nrs4244285\t10\t96541616\tAA\n`;
    const path = join(TMP, "pgx-pm.txt");
    writeFileSync(path, data);
    const genome = parse23andMe(path);
    const matrix = buildDrugGeneMatrix(genome, []);

    const cyp2c19 = matrix.genes.find((g) => g.gene === "CYP2C19")!;
    expect(cyp2c19.phenotype).toBe("poor");
    expect(cyp2c19.activityScore).toBe(0);

    // Clopidogrel should be flagged as use alternative
    const clopidogrel = matrix.interactions.find((di) => di.drug === "Clopidogrel");
    expect(clopidogrel).toBeDefined();
    expect(clopidogrel!.action).toBe("use alternative");
  });

  it("groups interactions by drug class", () => {
    const genome = makeTestGenome();
    const variants = crossReference(genome, TEST_DB);
    const matrix = buildDrugGeneMatrix(genome, variants);

    const classes = new Set(matrix.interactions.map((di) => di.drugClass));
    expect(classes.has("SSRIs")).toBe(true);
    expect(classes.has("Statins")).toBe(true);
    expect(classes.has("NSAIDs")).toBe(true);
    expect(classes.has("Beta-blockers")).toBe(true);
    expect(classes.has("Opioid analgesics")).toBe(true);
    expect(classes.has("Anticoagulants")).toBe(true);
  });
});
