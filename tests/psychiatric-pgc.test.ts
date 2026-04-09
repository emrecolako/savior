import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PgsScoringFile, SnpDatabase, ParsedGenome } from "../src/types.js";
import { loadPgsIndex, loadPgsScoringFile } from "../src/database/pgs-loader.js";
import { loadDatabase } from "../src/database/loader.js";
import { detectPathways } from "../src/analysis/engine.js";
import { PATHWAY_DEFINITIONS } from "../src/analysis/pathways.js";
import { computePrs } from "../src/analysis/prs-engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");

// ── Helpers ──────────────────────────────────────────────────

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

// ── PGS index ─────────────────────────────────────────────────

describe("PGC psychiatric PGS index", () => {
  it("includes all 4 psychiatric traits in the index", () => {
    const index = loadPgsIndex();
    const traitIds = index.traits.map((t) => t.traitId);
    expect(traitIds).toContain("schizophrenia");
    expect(traitIds).toContain("bipolar");
    expect(traitIds).toContain("mdd");
    expect(traitIds).toContain("adhd");
  });

  it("has correct PGS IDs for psychiatric traits", () => {
    const index = loadPgsIndex();
    const byId = Object.fromEntries(index.traits.map((t) => [t.traitId, t]));
    expect(byId.schizophrenia.pgsId).toBe("PGC-SCZ3");
    expect(byId.bipolar.pgsId).toBe("PGC-BIP3");
    expect(byId.mdd.pgsId).toBe("PGC-MDD");
    expect(byId.adhd.pgsId).toBe("PGC-ADHD");
  });
});

// ── PGS scoring files ─────────────────────────────────────────

describe("PGC psychiatric PGS scoring files", () => {
  const traits = ["schizophrenia", "bipolar", "mdd", "adhd"] as const;

  for (const traitId of traits) {
    describe(traitId, () => {
      it("loads and parses correctly", () => {
        const scoring = loadPgsScoringFile(traitId);
        expect(scoring).toBeDefined();
        expect(scoring.traitId).toBe(traitId);
        expect(scoring.genomeBuild).toBe("GRCh37");
      });

      it("has 1200 curated variants", () => {
        const scoring = loadPgsScoringFile(traitId);
        expect(scoring.variants).toHaveLength(1200);
        expect(scoring.totalVariantsCurated).toBe(1200);
      });

      it("has valid population parameters", () => {
        const scoring = loadPgsScoringFile(traitId);
        expect(scoring.populationParams.sd).toBeGreaterThan(0);
        expect(scoring.populationParams.sampleSize).toBeGreaterThan(0);
      });

      it("has no duplicate rsids", () => {
        const scoring = loadPgsScoringFile(traitId);
        const rsids = scoring.variants.map((v) => v.rsid);
        expect(new Set(rsids).size).toBe(rsids.length);
      });

      it("all variants have required fields", () => {
        const scoring = loadPgsScoringFile(traitId);
        for (const v of scoring.variants) {
          expect(v.rsid).toMatch(/^rs\d+$/);
          expect(v.effectAllele).toMatch(/^[ATCG]$/);
          expect(v.otherAllele).toMatch(/^[ATCG]$/);
          expect(v.effectAllele).not.toBe(v.otherAllele);
          expect(typeof v.effectWeight).toBe("number");
          expect(v.chr).toBeDefined();
          expect(v.pos).toBeGreaterThan(0);
        }
      });

      it("PRS computation works with a synthetic genome", () => {
        const scoring = loadPgsScoringFile(traitId);
        const firstVariant = scoring.variants[0];
        const genome = makeSyntheticGenome({
          [firstVariant.rsid]: `${firstVariant.effectAllele}${firstVariant.otherAllele}`,
        });
        const result = computePrs(genome, scoring);
        expect(result.traitId).toBe(traitId);
        expect(result.variantsUsed).toBeGreaterThanOrEqual(1);
        expect(typeof result.percentile).toBe("number");
        expect(result.percentile).toBeGreaterThanOrEqual(0);
        expect(result.percentile).toBeLessThanOrEqual(100);
      });
    });
  }
});

// ── Supplementary psychiatric SNP database ────────────────────

describe("Psychiatric GWAS supplementary database", () => {
  it("loads as valid SnpDatabase JSON", () => {
    const raw = readFileSync(resolve(DATA_DIR, "psychiatric-gwas.json"), "utf-8");
    const db: SnpDatabase = JSON.parse(raw);
    expect(db.version).toBeDefined();
    expect(db.lastUpdated).toBeDefined();
    expect(db.entries.length).toBeGreaterThan(0);
  });

  it("all entries are category psychiatric", () => {
    const raw = readFileSync(resolve(DATA_DIR, "psychiatric-gwas.json"), "utf-8");
    const db: SnpDatabase = JSON.parse(raw);
    for (const entry of db.entries) {
      expect(entry.category).toBe("psychiatric");
    }
  });

  it("all entries have PGC GWAS evidence level", () => {
    const raw = readFileSync(resolve(DATA_DIR, "psychiatric-gwas.json"), "utf-8");
    const db: SnpDatabase = JSON.parse(raw);
    for (const entry of db.entries) {
      expect(entry.evidenceLevel).toContain("GWAS meta-analysis (PGC)");
    }
  });

  it("all entries have PMID sources", () => {
    const raw = readFileSync(resolve(DATA_DIR, "psychiatric-gwas.json"), "utf-8");
    const db: SnpDatabase = JSON.parse(raw);
    for (const entry of db.entries) {
      expect(entry.sources).toBeDefined();
      expect(entry.sources!.length).toBeGreaterThan(0);
      expect(entry.sources![0]).toMatch(/^PMID:\d+$/);
    }
  });

  it("has no duplicate rsids", () => {
    const raw = readFileSync(resolve(DATA_DIR, "psychiatric-gwas.json"), "utf-8");
    const db: SnpDatabase = JSON.parse(raw);
    const rsids = db.entries.map((e) => e.rsid);
    expect(new Set(rsids).size).toBe(rsids.length);
  });

  it("is auto-loaded by loadDatabase()", () => {
    const db = loadDatabase();
    const psychiatricEntries = db.entries.filter((e) => e.category === "psychiatric");
    // Should have original 9 + new PGC entries
    expect(psychiatricEntries.length).toBeGreaterThan(9);
  });
});

// ── Psychiatric pathway definitions ───────────────────────────

describe("Psychiatric pathway definitions", () => {
  const psychiatricSlugs = ["glutamate", "gaba", "hpa-axis", "synaptic-plasticity", "neuroinflammation"];

  it("all 5 new psychiatric pathways are defined", () => {
    const slugs = PATHWAY_DEFINITIONS.map((p) => p.slug);
    for (const slug of psychiatricSlugs) {
      expect(slugs).toContain(slug);
    }
  });

  for (const slug of psychiatricSlugs) {
    describe(slug, () => {
      const pathway = PATHWAY_DEFINITIONS.find((p) => p.slug === slug)!;

      it("has psychiatric category", () => {
        expect(pathway.categories).toContain("psychiatric");
      });

      it("has gene patterns", () => {
        expect(pathway.genePatterns.length).toBeGreaterThan(0);
      });

      it("has interaction notes", () => {
        expect(Object.keys(pathway.interactionNotes).length).toBeGreaterThan(0);
      });

      it("has valid synergy parameters", () => {
        expect(pathway.synergyMultiplier).toBeGreaterThan(1);
        expect(pathway.homozygousPenalty).toBeGreaterThan(1);
      });

      it("has a narrative template with placeholders", () => {
        expect(pathway.narrativeTemplate).toContain("{{variantCount}}");
        expect(pathway.narrativeTemplate).toContain("{{synergyScore}}");
      });

      it("has at least one action template", () => {
        expect(pathway.actionTemplates.length).toBeGreaterThan(0);
      });
    });
  }

  it("catecholamine pathway still exists (not replaced)", () => {
    const slugs = PATHWAY_DEFINITIONS.map((p) => p.slug);
    expect(slugs).toContain("catecholamine");
  });
});

// ── Pathway detection with psychiatric variants ───────────────

describe("Psychiatric pathway detection", () => {
  const psychiatricDb: SnpDatabase = {
    version: "test",
    lastUpdated: "2026-01-01",
    entries: [
      {
        rsid: "rs4523957",
        gene: "GRIN2A",
        riskAllele: "T",
        condition: "Schizophrenia — NMDA receptor",
        category: "psychiatric",
        severity: "moderate",
        evidenceLevel: "GWAS",
        notes: "NMDA receptor subunit",
        tags: ["pathway:glutamate"],
      },
      {
        rsid: "rs4766428",
        gene: "CACNA1C",
        riskAllele: "T",
        condition: "Schizophrenia — calcium channel",
        category: "psychiatric",
        severity: "moderate",
        evidenceLevel: "GWAS",
        notes: "L-type calcium channel",
        tags: ["pathway:glutamate"],
      },
      {
        rsid: "rs2007044",
        gene: "C4A",
        riskAllele: "G",
        condition: "Schizophrenia — complement",
        category: "psychiatric",
        severity: "moderate",
        evidenceLevel: "GWAS",
        notes: "Complement C4A",
        tags: ["pathway:neuroinflammation"],
      },
    ],
  };

  it("detects glutamate pathway from GRIN2A + CACNA1C", () => {
    const matchedVariants = psychiatricDb.entries.map((e) => ({
      ...e,
      chromosome: "1",
      position: 100,
      genotype: `${e.riskAllele}${e.riskAllele}`,
      zygosity: "homozygous" as const,
      riskAlleleCount: 2,
    }));

    const pathways = detectPathways(matchedVariants, PATHWAY_DEFINITIONS);
    const glutamatePathway = pathways.find((p) => p.slug === "glutamate");
    expect(glutamatePathway).toBeDefined();
    expect(glutamatePathway!.variants.length).toBeGreaterThanOrEqual(2);
    expect(glutamatePathway!.involvedGenes).toContain("GRIN2A");
    expect(glutamatePathway!.involvedGenes).toContain("CACNA1C");
  });

  it("detects neuroinflammation pathway from C4A", () => {
    const matchedVariants = psychiatricDb.entries.map((e) => ({
      ...e,
      chromosome: "1",
      position: 100,
      genotype: `${e.riskAllele}${e.riskAllele}`,
      zygosity: "homozygous" as const,
      riskAlleleCount: 2,
    }));

    const pathways = detectPathways(matchedVariants, PATHWAY_DEFINITIONS);
    const neuroPathway = pathways.find((p) => p.slug === "neuroinflammation");
    expect(neuroPathway).toBeDefined();
    expect(neuroPathway!.involvedGenes).toContain("C4A");
  });
});
