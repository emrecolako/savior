import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PubMedProvider, ExaProvider, FallbackProvider, RateLimiter, enrichWithResearch, setSleep, resetSleep, scoreRelevance, extractAbstractFromXml, generateResearchSummary, classifyEvidenceDirection, annotateEvidenceDirection, searchClinicalTrials, saveResearchFindings, loadResearchFindings } from "../src/research/index.js";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, unlinkSync } from "node:fs";
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
  setSleep(() => Promise.resolve()); // Skip real delays in tests
});

afterEach(() => {
  resetSleep();
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
    expect(searchUrl).toContain("retmax=6"); // fetches 2x for deduplication headroom
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

  it("extracts PMC URL when pmcid is available", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("esearch.fcgi")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ esearchresult: { idlist: ["99001"] } }) });
      }
      if (urlStr.includes("esummary.fcgi")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            result: {
              "99001": {
                title: "Open access paper",
                source: "PLoS Genet",
                pubdate: "2025",
                articleids: [
                  { idtype: "pubmed", value: "99001" },
                  { idtype: "pmc", value: "PMC1234567" },
                ],
              },
            },
          }),
        });
      }
      // efetch returns empty XML
      if (urlStr.includes("efetch.fcgi")) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    const provider = new PubMedProvider();
    const findings = await provider.search(makeVariant(), 3);
    expect(findings).toHaveLength(1);
    expect(findings[0].pmcUrl).toBe("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/");
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
      makeVariant({ rsid: "rs-fail", gene: "BRCA1", severity: "critical", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs-ok", gene: "BRCA2", severity: "critical", riskAlleleCount: 1 }),
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

describe("RateLimiter", () => {
  it("allows immediate acquisition when tokens are available", async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    // Should be near-instant with sleep mocked
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("resets to full capacity", async () => {
    const limiter = new RateLimiter(2);
    await limiter.acquire();
    await limiter.acquire();
    limiter.reset();
    // Should have tokens again after reset
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe("ExaProvider", () => {
  it("builds semantic query from gene, condition, and rsID", () => {
    const provider = new ExaProvider("test-key");
    const query = provider.buildQuery(makeVariant({
      gene: "APOE",
      condition: "Alzheimer's disease risk",
      rsid: "rs429358",
    }));
    expect(query).toContain("APOE");
    expect(query).toContain("Alzheimer's disease risk");
    expect(query).toContain("rs429358");
  });

  it("returns empty array when no API key provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = new ExaProvider("");
    const findings = await provider.search(makeVariant(), 3);
    expect(findings).toEqual([]);
    warnSpy.mockRestore();
  });

  it("parses Exa API response into findings", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [
            {
              title: "APOE4 Risk Meta-Analysis",
              url: "https://pubmed.ncbi.nlm.nih.gov/12345/",
              publishedDate: "2025-03-01T00:00:00.000Z",
              text: "A comprehensive meta-analysis of APOE e4 allele and Alzheimer's disease risk.",
            },
          ],
        }),
      })
    );

    const provider = new ExaProvider("test-key");
    const findings = await provider.search(makeVariant(), 3, 2024);

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("APOE4 Risk Meta-Analysis");
    expect(findings[0].date).toBe("2025-03-01");
    expect(findings[0].source).toBe("pubmed.ncbi.nlm.nih.gov");
  });
});

describe("PubMedProvider query building", () => {
  it("strips star-allele annotations from condition in query", () => {
    const provider = new PubMedProvider();
    const variant = makeVariant({
      gene: "CYP2C9",
      condition: "CYP2C9*2 — warfarin sensitivity",
    });
    const query = provider.buildQuery(variant, 2024);
    expect(query).toContain('"CYP2C9"[gene]');
    expect(query).toContain("warfarin sensitivity");
    expect(query).not.toContain("*2");
  });

  it("includes MeSH human filter", () => {
    const provider = new PubMedProvider();
    const query = provider.buildQuery(makeVariant());
    expect(query).toContain("humans[mesh]");
  });

  it("uses tiab search for rsID", () => {
    const provider = new PubMedProvider();
    const query = provider.buildQuery(makeVariant());
    expect(query).toContain('"rs429358"[tiab]');
  });
});

describe("PubMedProvider caching", () => {
  it("returns cached results on second call for same variant", async () => {
    let fetchCount = 0;
    vi.stubGlobal("fetch", (url: string) => {
      fetchCount++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("esearch.fcgi")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESEARCH_RESPONSE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESUMMARY_RESPONSE) });
    });

    const provider = new PubMedProvider();
    const variant = makeVariant();

    const first = await provider.search(variant, 3, 2024);
    const fetchCountAfterFirst = fetchCount;

    const second = await provider.search(variant, 3, 2024);
    // Second call should not make any fetch requests
    expect(fetchCount).toBe(fetchCountAfterFirst);
    expect(second).toEqual(first);
    // Cached copy should be independent (no shared reference)
    expect(second).not.toBe(first);
  });
});

describe("PubMedProvider deduplication", () => {
  it("deduplicates results with identical normalized titles", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("esearch.fcgi")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            esearchresult: { idlist: ["1", "2", "3"] },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          result: {
            "1": { title: "APOE and Alzheimer's Disease", source: "Nature", pubdate: "2025" },
            "2": { title: "APOE and Alzheimer's Disease", source: "Science", pubdate: "2025" },  // duplicate
            "3": { title: "Different Paper", source: "Lancet", pubdate: "2025" },
          },
        }),
      });
    });

    const provider = new PubMedProvider();
    const findings = await provider.search(makeVariant(), 5);
    expect(findings).toHaveLength(2);
    expect(findings[0].title).toBe("APOE and Alzheimer's Disease");
    expect(findings[1].title).toBe("Different Paper");
  });
});

describe("enrichWithResearch gene deduplication", () => {
  it("shares findings across variants in the same gene", async () => {
    const variants = [
      makeVariant({ rsid: "rs1", gene: "APOE", severity: "critical", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs2", gene: "APOE", severity: "high", riskAlleleCount: 1 }),
      makeVariant({ rsid: "rs3", gene: "BRCA2", severity: "critical", riskAlleleCount: 1 }),
    ];

    let searchCount = 0;
    vi.stubGlobal("fetch", (url: string) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("esearch.fcgi")) {
        searchCount++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESEARCH_RESPONSE) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESUMMARY_RESPONSE) });
    });

    await enrichWithResearch(variants, {
      provider: "pubmed",
      maxResultsPerVariant: 3,
      minYear: 2024,
      enabled: true,
    });

    // Should only make 2 esearch calls (APOE + BRCA2), not 3
    expect(searchCount).toBe(2);
    // Both APOE variants should have findings
    expect(variants[0].recentFindings!.length).toBeGreaterThan(0);
    expect(variants[1].recentFindings!.length).toBeGreaterThan(0);
  });
});

describe("FallbackProvider", () => {
  it("returns primary results when available", async () => {
    const primary: any = {
      name: "primary",
      search: async () => [{ title: "Primary Paper", source: "J1", url: "", date: "2025", summary: "" }],
    };
    const secondary: any = {
      name: "secondary",
      search: async () => [{ title: "Secondary Paper", source: "J2", url: "", date: "2025", summary: "" }],
    };

    const provider = new FallbackProvider(primary, secondary);
    const results = await provider.search(makeVariant(), 3);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Primary Paper");
  });

  it("falls back to secondary when primary returns empty", async () => {
    const primary: any = { name: "primary", search: async () => [] };
    const secondary: any = {
      name: "secondary",
      search: async () => [{ title: "Fallback Paper", source: "J2", url: "", date: "2025", summary: "" }],
    };

    const provider = new FallbackProvider(primary, secondary);
    const results = await provider.search(makeVariant(), 3);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Fallback Paper");
  });

  it("falls back to secondary when primary throws", async () => {
    const primary: any = { name: "primary", search: async () => { throw new Error("fail"); } };
    const secondary: any = {
      name: "secondary",
      search: async () => [{ title: "Rescue Paper", source: "J2", url: "", date: "2025", summary: "" }],
    };

    const provider = new FallbackProvider(primary, secondary);
    const results = await provider.search(makeVariant(), 3);
    expect(results[0].title).toBe("Rescue Paper");
  });

  it("returns empty when both providers fail", async () => {
    const primary: any = { name: "p", search: async () => { throw new Error("fail"); } };
    const secondary: any = { name: "s", search: async () => { throw new Error("fail2"); } };

    const provider = new FallbackProvider(primary, secondary);
    const results = await provider.search(makeVariant(), 3);
    expect(results).toEqual([]);
  });
});

describe("Abstract extraction from XML", () => {
  it("extracts plain abstract text", () => {
    const xml = `<AbstractText>This is a study about APOE and Alzheimer's disease.</AbstractText>`;
    expect(extractAbstractFromXml(xml)).toBe("This is a study about APOE and Alzheimer's disease.");
  });

  it("handles structured abstracts with labels", () => {
    const xml = `
      <AbstractText Label="BACKGROUND">Background info.</AbstractText>
      <AbstractText Label="METHODS">Study methods.</AbstractText>
      <AbstractText Label="RESULTS">Key results.</AbstractText>
    `;
    const result = extractAbstractFromXml(xml);
    expect(result).toContain("BACKGROUND: Background info.");
    expect(result).toContain("METHODS: Study methods.");
    expect(result).toContain("RESULTS: Key results.");
  });

  it("strips inline HTML tags from abstract", () => {
    const xml = `<AbstractText>The <i>APOE</i> gene encodes <b>apolipoprotein E</b>.</AbstractText>`;
    expect(extractAbstractFromXml(xml)).toBe("The APOE gene encodes apolipoprotein E.");
  });

  it("returns empty string when no abstract present", () => {
    const xml = `<Title>Some title</Title>`;
    expect(extractAbstractFromXml(xml)).toBe("");
  });
});

describe("Clinical trials search", () => {
  it("parses ClinicalTrials.gov API response", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          studies: [
            {
              protocolSection: {
                identificationModule: {
                  nctId: "NCT12345678",
                  briefTitle: "APOE Gene Therapy Trial",
                },
                statusModule: { overallStatus: "RECRUITING" },
                designModule: { phases: ["PHASE3"] },
                conditionsModule: { conditions: ["Alzheimer Disease"] },
                armsInterventionsModule: {
                  interventions: [{ type: "Drug", name: "Lecanemab" }],
                },
              },
            },
          ],
        }),
      })
    );

    const trials = await searchClinicalTrials("APOE", "Alzheimer's disease", 3);
    expect(trials).toHaveLength(1);
    expect(trials[0].nctId).toBe("NCT12345678");
    expect(trials[0].title).toBe("APOE Gene Therapy Trial");
    expect(trials[0].status).toBe("RECRUITING");
    expect(trials[0].phase).toBe("PHASE3");
    expect(trials[0].conditions).toContain("Alzheimer Disease");
    expect(trials[0].interventions[0]).toContain("Lecanemab");
    expect(trials[0].url).toContain("NCT12345678");
  });

  it("returns empty array on API error", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 500 } as Response)
    );
    const trials = await searchClinicalTrials("FAKE", "nothing", 3);
    expect(trials).toEqual([]);
  });

  it("handles empty response", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ studies: [] }),
      })
    );
    const trials = await searchClinicalTrials("APOE", "Alzheimer", 3);
    expect(trials).toEqual([]);
  });
});

describe("Research relevance scoring", () => {
  it("scores papers mentioning rsID higher", () => {
    const variant = makeVariant({ rsid: "rs429358", gene: "APOE" });
    const withRsid = scoreRelevance(
      { title: "rs429358 in Alzheimer's disease", source: "J Neurol", url: "", date: "2025", summary: "" },
      variant
    );
    const withoutRsid = scoreRelevance(
      { title: "Genetics of neurodegenerative disease", source: "J Neurol", url: "", date: "2025", summary: "" },
      variant
    );
    expect(withRsid).toBeGreaterThan(withoutRsid);
  });

  it("scores meta-analyses and high-impact journals higher", () => {
    const variant = makeVariant();
    const metaAnalysis = scoreRelevance(
      { title: "Meta-analysis of APOE", source: "Nature Genetics", url: "", date: "2025", summary: "" },
      variant
    );
    const regularPaper = scoreRelevance(
      { title: "Study of APOE", source: "Small Journal", url: "", date: "2025", summary: "" },
      variant
    );
    expect(metaAnalysis).toBeGreaterThan(regularPaper);
  });

  it("gives recency bonus to current year papers", () => {
    const variant = makeVariant();
    const recent = scoreRelevance(
      { title: "APOE study", source: "Nature", url: "", date: "2026 Jan", summary: "" },
      variant
    );
    const older = scoreRelevance(
      { title: "APOE study", source: "Nature", url: "", date: "2020 Jan", summary: "" },
      variant
    );
    expect(recent).toBeGreaterThan(older);
  });
});

describe("Research summary generation", () => {
  it("generates summary from variants with findings", () => {
    const variants = [
      makeVariant({
        rsid: "rs1", gene: "APOE",
        recentFindings: [
          { title: "APOE Paper", source: "Nature", url: "", date: "2025", summary: "", evidenceDirection: "supports-risk" },
        ],
      }),
      makeVariant({
        rsid: "rs2", gene: "BRCA2",
        recentFindings: [
          { title: "BRCA2 Paper", source: "Science", url: "", date: "2025", summary: "", evidenceDirection: "protective" },
        ],
      }),
    ];
    const summary = generateResearchSummary(variants);
    expect(summary).toContain("2 relevant papers");
    expect(summary).toContain("2 variants");
    expect(summary).toContain("APOE");
    expect(summary).toContain("BRCA2");
    expect(summary).toContain("1 supporting risk");
    expect(summary).toContain("1 protective");
  });

  it("returns fallback message when no findings", () => {
    const summary = generateResearchSummary([makeVariant()]);
    expect(summary).toContain("No recent research findings");
  });

  it("groups multiple variants in same gene", () => {
    const variants = [
      makeVariant({
        rsid: "rs1", gene: "APOE",
        recentFindings: [{ title: "Paper 1", source: "J1", url: "", date: "2025", summary: "" }],
      }),
      makeVariant({
        rsid: "rs2", gene: "APOE",
        recentFindings: [{ title: "Paper 2", source: "J2", url: "", date: "2025", summary: "" }],
      }),
    ];
    const summary = generateResearchSummary(variants);
    expect(summary).toContain("rs1, rs2");
    expect(summary).toContain("APOE");
  });
});

describe("Evidence direction classification", () => {
  it("classifies risk-supporting papers", () => {
    const finding = {
      title: "rs429358 is associated with increased risk of Alzheimer's disease",
      source: "Nat Genet", url: "", date: "2025",
      summary: "This variant is a known risk factor with elevated susceptibility.",
    };
    expect(classifyEvidenceDirection(finding, makeVariant())).toBe("supports-risk");
  });

  it("classifies protective papers", () => {
    const finding = {
      title: "Protective variant reduces risk of cardiovascular disease",
      source: "Lancet", url: "", date: "2025",
      summary: "This allele is associated with decreased risk and beneficial outcomes.",
    };
    expect(classifyEvidenceDirection(finding, makeVariant())).toBe("protective");
  });

  it("classifies neutral/null results", () => {
    const finding = {
      title: "No significant association between rs429358 and disease",
      source: "BMJ", url: "", date: "2025",
      summary: "Failed to replicate the previously reported association. Null result.",
    };
    expect(classifyEvidenceDirection(finding, makeVariant())).toBe("neutral");
  });

  it("returns uncertain when no clear signal", () => {
    const finding = {
      title: "Genetic architecture of complex traits",
      source: "Science", url: "", date: "2025",
      summary: "A broad overview of genomic approaches.",
    };
    expect(classifyEvidenceDirection(finding, makeVariant())).toBe("uncertain");
  });

  it("handles protective variants correctly", () => {
    const finding = {
      title: "This allele provides reduced risk of disease",
      source: "Nature", url: "", date: "2025",
      summary: "Protective effect confirmed in large cohort.",
    };
    const protectiveVariant = makeVariant({ severity: "protective" as any });
    expect(classifyEvidenceDirection(finding, protectiveVariant)).toBe("protective");
  });
});

describe("annotateEvidenceDirection", () => {
  it("annotates all findings on variants", () => {
    const variants = [
      makeVariant({
        recentFindings: [
          { title: "Increased risk of disease", source: "J1", url: "", date: "2025", summary: "risk factor" },
          { title: "No association found", source: "J2", url: "", date: "2025", summary: "no significant association" },
        ],
      }),
    ];
    annotateEvidenceDirection(variants);
    expect(variants[0].recentFindings![0].evidenceDirection).toBe("supports-risk");
    expect(variants[0].recentFindings![1].evidenceDirection).toBe("neutral");
  });

  it("skips findings that already have direction", () => {
    const variants = [
      makeVariant({
        recentFindings: [
          { title: "Some paper", source: "J1", url: "", date: "2025", summary: "increased risk", evidenceDirection: "protective" as any },
        ],
      }),
    ];
    annotateEvidenceDirection(variants);
    // Should preserve existing annotation
    expect(variants[0].recentFindings![0].evidenceDirection).toBe("protective");
  });

  it("skips variants without findings", () => {
    const variants = [makeVariant()];
    // Should not throw
    annotateEvidenceDirection(variants);
    expect(variants[0].recentFindings).toBeUndefined();
  });
});

describe("enrichWithResearch edge cases", () => {
  it("returns unmodified variants when provider is none", async () => {
    const variants = [makeVariant({ rsid: "rs1", severity: "critical", riskAlleleCount: 1 })];
    const result = await enrichWithResearch(variants, {
      provider: "none",
      maxResultsPerVariant: 3,
      enabled: true,
    });
    expect(result[0].recentFindings).toBeUndefined();
  });

  it("returns unmodified variants when disabled", async () => {
    const variants = [makeVariant({ rsid: "rs1", severity: "critical", riskAlleleCount: 1 })];
    const result = await enrichWithResearch(variants, {
      provider: "pubmed",
      maxResultsPerVariant: 3,
      enabled: false,
    });
    expect(result[0].recentFindings).toBeUndefined();
  });

  it("warns and returns unmodified for unknown provider", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const variants = [makeVariant({ rsid: "rs1", severity: "critical", riskAlleleCount: 1 })];
    await enrichWithResearch(variants, {
      provider: "unknown" as any,
      maxResultsPerVariant: 3,
      enabled: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown research provider"));
    expect(variants[0].recentFindings).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("skips moderate-severity variants", async () => {
    const variants = [
      makeVariant({ rsid: "rs1", severity: "moderate", riskAlleleCount: 2 }),
      makeVariant({ rsid: "rs2", severity: "low", riskAlleleCount: 1 }),
    ];
    await enrichWithResearch(variants, {
      provider: "pubmed",
      maxResultsPerVariant: 3,
      enabled: true,
    });
    expect(variants[0].recentFindings).toBeUndefined();
    expect(variants[1].recentFindings).toBeUndefined();
  });
});

describe("Research persistence", () => {
  const TMP = join(tmpdir(), "genomic-report-research-test");
  try { mkdirSync(TMP, { recursive: true }); } catch {}

  it("saves and loads research findings", () => {
    const filePath = join(TMP, "test-findings.json");
    const variants = [
      makeVariant({
        rsid: "rs1",
        gene: "APOE",
        recentFindings: [
          { title: "Paper 1", source: "Nature", url: "https://example.com/1", date: "2025", summary: "Summary 1", evidenceDirection: "supports-risk" },
        ],
      }),
      makeVariant({ rsid: "rs2", gene: "BRCA2" }), // no findings
    ];

    saveResearchFindings(variants, filePath);

    // Load into fresh variants
    const freshVariants = [
      makeVariant({ rsid: "rs1", gene: "APOE" }),
      makeVariant({ rsid: "rs2", gene: "BRCA2" }),
    ];
    const loaded = loadResearchFindings(freshVariants, filePath);
    expect(loaded).toBe(true);
    expect(freshVariants[0].recentFindings).toHaveLength(1);
    expect(freshVariants[0].recentFindings![0].title).toBe("Paper 1");
    expect(freshVariants[1].recentFindings).toBeUndefined();

    try { unlinkSync(filePath); } catch {}
  });

  it("returns false when file doesn't exist", () => {
    const loaded = loadResearchFindings([makeVariant()], "/nonexistent/path.json");
    expect(loaded).toBe(false);
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
