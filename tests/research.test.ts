import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PubMedProvider, enrichWithResearch } from "../src/research/index.js";
import { generateMarkdown } from "../src/reports/markdown.js";
import type { MatchedVariant, AnalysisResult, ResearchConfig } from "../src/types.js";

// ─── Test fixtures ──────────────────────────────────────────────

function makeVariant(overrides: Partial<MatchedVariant> = {}): MatchedVariant {
  return {
    rsid: "rs429358",
    chromosome: "19",
    position: 44908684,
    genotype: "CT",
    zygosity: "heterozygous",
    gene: "APOE",
    riskAllele: "C",
    riskAlleleCount: 1,
    condition: "Alzheimer's disease risk",
    category: "neurological",
    severity: "critical",
    evidenceLevel: "Definitive",
    notes: "APOE e4 allele",
    ...overrides,
  };
}

const MOCK_ESEARCH_RESPONSE = {
  esearchresult: {
    idlist: ["39000001", "39000002"],
  },
};

const MOCK_ESUMMARY_RESPONSE = {
  result: {
    "39000001": {
      title: "APOE e4 and Alzheimer risk: a 2025 meta-analysis",
      source: "Nat Genet",
      pubdate: "2025 Mar",
    },
    "39000002": {
      title: "Polygenic risk scores including APOE variants",
      source: "Lancet Neurol",
      pubdate: "2025 Jan",
    },
  },
};

// ─── Mock fetch ─────────────────────────────────────────────────

let fetchCalls: string[] = [];

function mockFetch(url: string | URL | Request) {
  const urlStr = typeof url === "string" ? url : url.toString();
  fetchCalls.push(urlStr);
  if (urlStr.includes("esearch.fcgi")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESEARCH_RESPONSE) });
  }
  if (urlStr.includes("esummary.fcgi")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESUMMARY_RESPONSE) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("PubMedProvider", () => {
  it("builds correct query URL with rsid, gene, condition, and minYear", async () => {
    const provider = new PubMedProvider();
    await provider.search(makeVariant(), 3, 2024);

    const searchUrl = fetchCalls.find((u) => u.includes("esearch.fcgi"));
    expect(searchUrl).toBeDefined();
    expect(searchUrl).toContain("db=pubmed");
    expect(searchUrl).toContain("retmax=3");
    expect(searchUrl).toContain(encodeURIComponent('"rs429358"'));
    expect(searchUrl).toContain(encodeURIComponent("2024:3000[dp]"));
  });

  it("parses PubMed response into ResearchFinding[]", async () => {
    const provider = new PubMedProvider();
    const findings = await provider.search(makeVariant(), 3, 2024);

    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({
      title: "APOE e4 and Alzheimer risk: a 2025 meta-analysis",
      source: "Nat Genet",
      url: "https://pubmed.ncbi.nlm.nih.gov/39000001/",
      date: "2025 Mar",
      summary: "APOE e4 and Alzheimer risk: a 2025 meta-analysis",
    });
    expect(findings[1].source).toBe("Lancet Neurol");
  });

  it("returns empty array when no PMIDs found", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ esearchresult: { idlist: [] } }),
      })
    );

    const provider = new PubMedProvider();
    const findings = await provider.search(makeVariant(), 3);
    expect(findings).toEqual([]);
  });

  it("appends api_key when provided", async () => {
    const provider = new PubMedProvider("my-test-key");
    await provider.search(makeVariant(), 3);

    for (const url of fetchCalls) {
      expect(url).toContain("api_key=my-test-key");
    }
  });
});

describe("enrichWithResearch", () => {
  it("only researches critical/high variants with risk alleles", async () => {
    const variants = [
      makeVariant({ rsid: "rs1", severity: "critical", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs2", severity: "moderate", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs3", severity: "high", riskAlleleCount: 0 }),
      makeVariant({ rsid: "rs4", severity: "high", riskAlleleCount: 2 }),
    ];

    await enrichWithResearch(variants, {
      provider: "pubmed",
      maxResultsPerVariant: 3,
      minYear: 2024,
      enabled: true,
    });

    // Only rs1 (critical, risk=1) and rs4 (high, risk=2) should have findings
    expect(variants[0].recentFindings).toHaveLength(2);
    expect(variants[1].recentFindings).toBeUndefined();
    expect(variants[2].recentFindings).toBeUndefined();
    expect(variants[3].recentFindings).toHaveLength(2);
  });

  it("handles per-variant errors without blocking others", async () => {
    let esearchCallCount = 0;
    vi.stubGlobal("fetch", (url: string) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("esearch.fcgi")) {
        esearchCallCount++;
        // Fail all 3 attempts (initial + 2 retries) for the first variant
        if (esearchCallCount <= 3) {
          return Promise.resolve({ ok: false, status: 500 } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESEARCH_RESPONSE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESUMMARY_RESPONSE) });
    });

    const variants = [
      makeVariant({ rsid: "rs-fail", severity: "critical", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs-ok", severity: "critical", riskAlleleCount: 1 }),
    ];

    await enrichWithResearch(variants, {
      provider: "pubmed",
      maxResultsPerVariant: 3,
      enabled: true,
    });

    // First variant fails gracefully after all retries, second succeeds
    expect(variants[0].recentFindings).toEqual([]);
    expect(variants[1].recentFindings!.length).toBeGreaterThan(0);
  });
});

describe("Markdown rendering with research", () => {
  function makeResult(variants: MatchedVariant[]): AnalysisResult {
    return {
      inputFile: "test.txt",
      inputFormat: "23andme",
      buildVersion: "GRCh37",
      totalSnps: 600000,
      matchedCount: variants.length,
      analysisDate: "2026-01-01",
      apoe: {
        rs429358: "TT",
        rs7412: "CC",
        diplotype: "e3/e3",
        riskLevel: "average",
        explanation: "Most common genotype.",
      },
      variants,
      pathways: [],
      actionItems: [],
    };
  }

  it("renders research findings inline when includeRecentLiterature is true", () => {
    const variant = makeVariant({
      recentFindings: [
        {
          title: "Test Paper",
          source: "Nature",
          url: "https://pubmed.ncbi.nlm.nih.gov/123/",
          date: "2025",
          summary: "Test",
        },
      ],
    });

    const md = generateMarkdown(makeResult([variant]), {
      format: "markdown",
      outputPath: "test.md",
      includeSummary: false,
      includeRawVariants: true,
      includePathways: false,
      includeActionItems: false,
      includeRecentLiterature: true,
      includeMethodology: true,
      subjectName: "Test",
    });

    expect(md).toContain("[Test Paper]");
    expect(md).toContain("Nature");
    expect(md).toContain("Research enrichment via PubMed");
  });

  it("does not render research when includeRecentLiterature is false", () => {
    const variant = makeVariant({
      recentFindings: [
        {
          title: "Test Paper",
          source: "Nature",
          url: "https://pubmed.ncbi.nlm.nih.gov/123/",
          date: "2025",
          summary: "Test",
        },
      ],
    });

    const md = generateMarkdown(makeResult([variant]), {
      format: "markdown",
      outputPath: "test.md",
      includeSummary: false,
      includeRawVariants: true,
      includePathways: false,
      includeActionItems: false,
      includeRecentLiterature: false,
      includeMethodology: true,
      subjectName: "Test",
    });

    expect(md).not.toContain("[Test Paper]");
    expect(md).not.toContain("Research enrichment via PubMed");
  });
});
