/**
 * Research module — pluggable live literature search.
 *
 * This module enriches analysis results with the latest published
 * research for each flagged variant. Supports multiple backends:
 *
 * - `exa`    — Exa web search (fast, broad, includes preprints)
 * - `pubmed` — PubMed E-utilities API (authoritative, slower)
 * - `none`   — Skip research enrichment
 *
 * ## Adding a new provider
 *
 * 1. Create a file in this directory implementing `ResearchProviderImpl`
 * 2. Add it to the `PROVIDERS` map below
 * 3. Update the `ResearchProvider` union type in `types.ts`
 */

import type { MatchedVariant, ResearchFinding, ResearchConfig, EvidenceDirection } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────

let _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Override the internal sleep function (useful for testing). */
export function setSleep(fn: (ms: number) => Promise<void>) {
  _sleep = fn;
}

/** Reset sleep to the default implementation. */
export function resetSleep() {
  _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
}

const sleep = (ms: number) => _sleep(ms);

export async function fetchWithRetry(url: string, retries = 2, timeoutMs = 10000): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res.json();
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Timeout after ${timeoutMs}ms from ${new URL(url).hostname}`);
      }
      throw err;
    }
  }
}

export async function fetchText(url: string, retries = 2, timeoutMs = 10000): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return (res as any).text ? await (res as any).text() : "";
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Timeout after ${timeoutMs}ms from ${new URL(url).hostname}`);
      }
      throw err;
    }
  }
  return "";
}

/**
 * Extract abstract text from PubMed XML efetch response.
 * Falls back to empty string if parsing fails.
 */
export function extractAbstractFromXml(xml: string): string {
  // Simple regex-based XML extraction (avoids DOM parser dependency)
  const abstractMatch = xml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);
  if (!abstractMatch) return "";

  return abstractMatch
    .map((block) => {
      // Extract label if present (e.g., "BACKGROUND", "METHODS")
      const labelMatch = block.match(/Label="([^"]+)"/);
      const textMatch = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
      const text = textMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";

      return labelMatch ? `${labelMatch[1]}: ${text}` : text;
    })
    .filter((t) => t.length > 0)
    .join(" ");
}

// ─── Rate limiter ───────────────────────────────────────────────

/**
 * Token-bucket rate limiter for API calls.
 * Ensures we don't exceed a maximum number of requests per second.
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRateMs: number; // ms per token refill
  private lastRefill: number;

  /**
   * @param maxRequestsPerSecond - Maximum requests per second (e.g., 3 for NCBI without key, 10 with)
   */
  constructor(maxRequestsPerSecond: number) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRateMs = 1000 / maxRequestsPerSecond;
    this.lastRefill = Date.now();
  }

  /** Wait until a token is available, then consume it. */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait for next token
    const waitMs = this.refillRateMs - (Date.now() - this.lastRefill);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed / this.refillRateMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /** Reset the limiter to full capacity. */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}

// ─── Provider interface ─────────────────────────────────────────

export interface ResearchProviderImpl {
  name: string;

  /**
   * Search for recent research on a specific variant.
   *
   * @param variant - The matched variant to research
   * @param maxResults - Maximum number of findings to return
   * @param minYear - Only return papers from this year onward
   * @returns Array of research findings
   */
  search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]>;
}

// ─── Exa provider (stub) ────────────────────────────────────────

export class ExaProvider implements ResearchProviderImpl {
  name = "exa";
  private apiKey: string;
  private cache = new Map<string, ResearchFinding[]>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Build a natural-language search query optimized for Exa's neural search.
   */
  buildQuery(variant: MatchedVariant): string {
    const parts: string[] = [];

    // Gene and condition provide the best semantic signal
    parts.push(variant.gene);
    parts.push(variant.condition.replace(/\*\d+\w?\s*—?\s*/g, "").trim());

    // rsID for specificity
    parts.push(variant.rsid);

    return parts.join(" ");
  }

  async search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]> {
    if (!this.apiKey) {
      console.warn("[exa] No API key provided. Skipping research.");
      return [];
    }

    // Check cache
    const cacheKey = `${variant.rsid}:${maxResults}:${minYear ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return [...cached];

    const query = this.buildQuery(variant);
    const body: Record<string, any> = {
      query,
      numResults: maxResults,
      type: "auto",
      useAutoprompt: true,
      category: "research paper",
    };

    if (minYear) {
      body.startPublishedDate = `${minYear}-01-01T00:00:00.000Z`;
    }

    try {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from Exa`);
      }

      const data = await (res as any).json();
      const results: ResearchFinding[] = (data.results ?? []).map((r: any) => ({
        title: r.title ?? "Untitled",
        source: r.url ? new URL(r.url).hostname.replace("www.", "") : "Unknown",
        url: r.url ?? "",
        date: r.publishedDate?.split("T")[0] ?? "Unknown date",
        summary: r.text?.slice(0, 300) ?? r.title ?? "",
      }));

      // Sort by relevance score
      const sorted = results.sort((a, b) => scoreRelevance(b, variant) - scoreRelevance(a, variant));
      this.cache.set(cacheKey, sorted);
      return sorted;
    } catch (err: any) {
      console.warn(`[exa] Search failed for ${variant.rsid}: ${err.message}`);
      return [];
    }
  }

  /** Clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }
}

// ─── PubMed provider (stub) ─────────────────────────────────────

export class PubMedProvider implements ResearchProviderImpl {
  name = "pubmed";
  private apiKey?: string;
  private cache = new Map<string, ResearchFinding[]>();
  private limiter: RateLimiter;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    // NCBI: 3 req/s without key, 10 req/s with key
    this.limiter = new RateLimiter(apiKey ? 10 : 3);
  }

  /** Clear the in-memory cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Build an optimized PubMed query for a variant.
   *
   * Strategy:
   * 1. Search by rsID (most specific)
   * 2. OR search by gene + simplified condition keywords
   * 3. Apply date filter and sort by relevance
   */
  buildQuery(variant: MatchedVariant, minYear?: number): string {
    // Extract key condition terms, stripping annotations like "CYP2C9*2 —"
    const conditionClean = variant.condition
      .replace(/\*\d+\w?\s*—?\s*/g, "")  // Remove star-allele annotations
      .replace(/\s+/g, " ")
      .trim();

    // Build tiered query: exact rsID is most specific, gene+condition is broader
    let query = `"${variant.rsid}"[tiab] OR ("${variant.gene}"[gene] AND "${conditionClean}"[tiab])`;

    if (minYear) {
      query += ` AND ${minYear}:3000[dp]`;
    }

    // Prefer reviews and meta-analyses for higher-quality results
    query += ` AND (humans[mesh])`;

    return query;
  }

  async search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]> {
    // Check cache first
    const cacheKey = `${variant.rsid}:${variant.gene}:${maxResults}:${minYear ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return [...cached]; // Return copy to prevent mutation

    const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

    const query = this.buildQuery(variant, minYear);

    // Request extra results to allow deduplication, sort by relevance
    const fetchCount = Math.min(maxResults * 2, 20);
    let searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${fetchCount}&sort=relevance&retmode=json`;
    if (this.apiKey) searchUrl += `&api_key=${this.apiKey}`;

    const searchData = await fetchWithRetry(searchUrl);
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    await this.limiter.acquire();

    let summaryUrl = `${BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
    if (this.apiKey) summaryUrl += `&api_key=${this.apiKey}`;

    const summaryData = await fetchWithRetry(summaryUrl);
    const results: ResearchFinding[] = [];
    const seenTitles = new Set<string>();

    for (const pmid of pmids) {
      const article = summaryData?.result?.[pmid];
      if (!article) continue;

      const title = article.title ?? "Untitled";

      // Deduplicate by normalized title (handles minor formatting differences)
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenTitles.has(normalizedTitle)) continue;
      seenTitles.add(normalizedTitle);

      // Build a more informative summary from available metadata
      const authors = article.authors?.slice(0, 3)?.map((a: any) => a.name).join(", ") ?? "";
      const authorsText = authors ? `${authors}${article.authors?.length > 3 ? " et al." : ""}` : "";
      const summary = authorsText ? `${authorsText}. ${title}` : title;

      // Check for PMC full-text availability
      const pmcid = article.articleids?.find((id: any) => id.idtype === "pmc")?.value;
      const pmcUrl = pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/` : undefined;

      results.push({
        title,
        source: article.source ?? "Unknown journal",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        date: article.pubdate ?? "Unknown date",
        summary,
        pmcUrl,
      });

      // Stop once we have enough deduplicated results
      if (results.length >= maxResults) break;
    }

    // Optionally fetch abstracts for top results (richer summaries)
    if (results.length > 0) {
      await this.limiter.acquire();
      try {
        const topPmids = results
          .map((r) => r.url.match(/\/(\d+)\/$/)?.[1])
          .filter(Boolean) as string[];
        let efetchUrl = `${BASE}/efetch.fcgi?db=pubmed&id=${topPmids.join(",")}&retmode=xml`;
        if (this.apiKey) efetchUrl += `&api_key=${this.apiKey}`;

        const xmlText = await fetchText(efetchUrl);
        if (xmlText) {
          // Extract abstracts per PMID
          const articles = xmlText.split(/<PubmedArticle>/g).slice(1);
          for (const articleXml of articles) {
            const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
            if (!pmidMatch) continue;

            const abstract = extractAbstractFromXml(articleXml);
            if (abstract) {
              const result = results.find((r) => r.url.includes(`/${pmidMatch![1]}/`));
              if (result) {
                // Truncate abstract to ~300 chars for report readability
                result.summary = abstract.length > 300
                  ? abstract.slice(0, 297) + "..."
                  : abstract;
              }
            }
          }
        }
      } catch {
        // Abstract fetch is best-effort — don't fail if it errors
      }
    }

    await this.limiter.acquire();

    // Sort by relevance score (highest first)
    const sorted = results.sort((a, b) => scoreRelevance(b, variant) - scoreRelevance(a, variant));

    // Cache for subsequent lookups
    this.cache.set(cacheKey, sorted);

    return sorted;
  }
}

// ─── Research quality scoring ────────────────────────────────────

/**
 * Score a research finding's relevance to the queried variant.
 * Higher scores indicate more relevant papers.
 */
export function scoreRelevance(finding: ResearchFinding, variant: MatchedVariant): number {
  let score = 0;
  const titleLower = finding.title.toLowerCase();
  const summaryLower = finding.summary.toLowerCase();
  const text = titleLower + " " + summaryLower;

  // Direct rsID mention is very specific
  if (text.includes(variant.rsid.toLowerCase())) score += 10;

  // Gene name mention
  if (text.includes(variant.gene.toLowerCase())) score += 5;

  // Condition keywords
  const condWords = variant.condition.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  for (const word of condWords) {
    if (text.includes(word)) score += 2;
  }

  // Prefer meta-analyses and reviews
  if (text.includes("meta-analysis") || text.includes("meta analysis")) score += 3;
  if (text.includes("systematic review")) score += 3;
  if (text.includes("genome-wide") || text.includes("gwas")) score += 2;

  // Prefer high-impact journals
  const highImpact = ["nature", "science", "lancet", "jama", "bmj", "cell", "n engl j med"];
  if (highImpact.some((j) => finding.source.toLowerCase().includes(j))) score += 3;

  // Recency bonus (extract year from date)
  const yearMatch = finding.date.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    const currentYear = new Date().getFullYear();
    if (year >= currentYear) score += 2;
    else if (year >= currentYear - 1) score += 1;
  }

  return score;
}

// ─── Evidence direction classification ──────────────────────────

const RISK_KEYWORDS = [
  "increased risk", "higher risk", "elevated risk", "risk factor",
  "susceptibility", "predisposition", "associated with increased",
  "contributes to", "pathogenic", "deleterious", "loss of function",
  "damaging", "risk allele", "odds ratio", "hazard ratio",
];

const PROTECTIVE_KEYWORDS = [
  "protective", "reduced risk", "lower risk", "decreased risk",
  "beneficial", "associated with decreased", "gain of function",
  "longevity", "resistance to", "protects against",
];

const NEUTRAL_KEYWORDS = [
  "no significant association", "no association", "not associated",
  "no evidence", "inconclusive", "conflicting", "nonsignificant",
  "failed to replicate", "null result",
];

/**
 * Classify the evidence direction of a research finding relative to a variant.
 * Uses keyword matching on title and summary to determine if the paper
 * supports risk, suggests protection, or is neutral/uncertain.
 */
export function classifyEvidenceDirection(
  finding: ResearchFinding,
  variant: MatchedVariant
): EvidenceDirection {
  const text = (finding.title + " " + finding.summary).toLowerCase();

  let riskScore = 0;
  let protectiveScore = 0;
  let neutralScore = 0;

  for (const kw of RISK_KEYWORDS) {
    if (text.includes(kw)) riskScore++;
  }
  for (const kw of PROTECTIVE_KEYWORDS) {
    if (text.includes(kw)) protectiveScore++;
  }
  for (const kw of NEUTRAL_KEYWORDS) {
    if (text.includes(kw)) neutralScore++;
  }

  // Context: if the variant itself is marked protective in the DB,
  // a "risk" paper may actually be confirming protection
  const isProtectiveVariant = variant.severity === "protective";

  if (neutralScore > 0 && neutralScore >= riskScore && neutralScore >= protectiveScore) {
    return "neutral";
  }

  if (isProtectiveVariant) {
    // For protective variants, "increased risk" in absence of the allele
    // actually supports the protective classification
    if (protectiveScore > 0 || riskScore > 0) return "protective";
  }

  if (riskScore > protectiveScore && riskScore > neutralScore) {
    return "supports-risk";
  }
  if (protectiveScore > riskScore && protectiveScore > neutralScore) {
    return "protective";
  }

  return "uncertain";
}

/**
 * Annotate all findings on matched variants with evidence direction.
 * Mutates findings in place.
 */
export function annotateEvidenceDirection(variants: MatchedVariant[]): void {
  for (const v of variants) {
    if (!v.recentFindings) continue;
    for (const f of v.recentFindings) {
      if (!f.evidenceDirection) {
        f.evidenceDirection = classifyEvidenceDirection(f, v);
      }
    }
  }
}

// ─── Research summary generator ─────────────────────────────────

/**
 * Generate a concise research summary from all findings across variants.
 * Groups by gene/condition and highlights the most relevant papers.
 */
export function generateResearchSummary(variants: MatchedVariant[]): string {
  const variantsWithFindings = variants.filter(
    (v) => v.recentFindings && v.recentFindings.length > 0
  );

  if (variantsWithFindings.length === 0) {
    return "No recent research findings were retrieved for the analysed variants.";
  }

  const lines: string[] = [];
  const totalPapers = variantsWithFindings.reduce(
    (sum, v) => sum + (v.recentFindings?.length ?? 0), 0
  );

  lines.push(
    `Research enrichment identified ${totalPapers} relevant paper${totalPapers !== 1 ? "s" : ""} ` +
    `across ${variantsWithFindings.length} variant${variantsWithFindings.length !== 1 ? "s" : ""}.`
  );

  // Group findings by gene for cohesive reporting
  const geneFindings = new Map<string, { variants: MatchedVariant[]; findings: ResearchFinding[] }>();
  for (const v of variantsWithFindings) {
    const group = geneFindings.get(v.gene) ?? { variants: [], findings: [] };
    group.variants.push(v);
    group.findings.push(...(v.recentFindings ?? []));
    geneFindings.set(v.gene, group);
  }

  // Evidence direction breakdown
  const allFindings = variantsWithFindings.flatMap((v) => v.recentFindings ?? []);
  const directionCounts = {
    "supports-risk": 0,
    protective: 0,
    neutral: 0,
    uncertain: 0,
  };
  for (const f of allFindings) {
    if (f.evidenceDirection) {
      directionCounts[f.evidenceDirection]++;
    }
  }

  const directionParts: string[] = [];
  if (directionCounts["supports-risk"] > 0) directionParts.push(`${directionCounts["supports-risk"]} supporting risk`);
  if (directionCounts.protective > 0) directionParts.push(`${directionCounts.protective} protective`);
  if (directionCounts.neutral > 0) directionParts.push(`${directionCounts.neutral} neutral`);
  if (directionCounts.uncertain > 0) directionParts.push(`${directionCounts.uncertain} uncertain`);
  if (directionParts.length > 0) {
    lines.push(`Evidence direction: ${directionParts.join(", ")}.`);
  }

  for (const [gene, { variants: geneVariants, findings }] of geneFindings) {
    const rsids = [...new Set(geneVariants.map((v) => v.rsid))].join(", ");
    const topFinding = findings[0]; // Already sorted by relevance
    if (topFinding) {
      const dirTag = topFinding.evidenceDirection ? ` [${topFinding.evidenceDirection}]` : "";
      lines.push(
        `**${gene}** (${rsids}): "${topFinding.title}" (${topFinding.source}, ${topFinding.date})${dirTag}.`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Generate an evidence-weighted research brief for a specific variant.
 * Combines relevance scoring with evidence direction for a one-liner summary.
 */
export function variantResearchBrief(variant: MatchedVariant): string {
  if (!variant.recentFindings || variant.recentFindings.length === 0) {
    return `${variant.gene} (${variant.rsid}): No recent research available.`;
  }

  const findings = variant.recentFindings;
  const dirCounts = { "supports-risk": 0, protective: 0, neutral: 0, uncertain: 0 };
  for (const f of findings) {
    if (f.evidenceDirection) dirCounts[f.evidenceDirection]++;
  }

  const dominant = (Object.entries(dirCounts) as [string, number][])
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a)[0];

  const dirLabel = dominant
    ? dominant[0] === "supports-risk" ? "risk-supporting"
    : dominant[0] === "protective" ? "protective"
    : dominant[0] === "neutral" ? "neutral"
    : "mixed"
    : "unclassified";

  const topPaper = findings[0];
  const pmcNote = topPaper.pmcUrl ? " (full text available)" : "";

  return `${variant.gene} (${variant.rsid}): ${findings.length} paper${findings.length !== 1 ? "s" : ""}, predominantly ${dirLabel}. Top: "${topPaper.title}" — ${topPaper.source}, ${topPaper.date}${pmcNote}.`;
}

// ─── Clinical trials search ─────────────────────────────────────

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  conditions: string[];
  interventions: string[];
  url: string;
}

/**
 * Search ClinicalTrials.gov for active trials related to a gene/condition.
 * Uses the v2 API (no key required).
 */
export async function searchClinicalTrials(
  gene: string,
  condition: string,
  maxResults = 5
): Promise<ClinicalTrial[]> {
  const query = `${gene} ${condition.replace(/\*\d+\w?\s*—?\s*/g, "").trim()}`;
  const url =
    `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}` +
    `&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING` +
    `&pageSize=${maxResults}&format=json`;

  try {
    const data = await fetchWithRetry(url, 1, 8000);
    const studies = data?.studies ?? [];

    return studies.map((s: any) => {
      const proto = s.protocolSection ?? {};
      const id = proto.identificationModule ?? {};
      const status = proto.statusModule ?? {};
      const design = proto.armsInterventionsModule ?? {};
      const conditions = proto.conditionsModule?.conditions ?? [];
      const interventions = (design.interventions ?? []).map(
        (i: any) => `${i.type ?? ""}: ${i.name ?? ""}`.trim()
      );

      return {
        nctId: id.nctId ?? "Unknown",
        title: id.briefTitle ?? id.officialTitle ?? "Untitled",
        status: status.overallStatus ?? "Unknown",
        phase: (proto.designModule?.phases ?? []).join(", ") || "N/A",
        conditions,
        interventions,
        url: `https://clinicaltrials.gov/study/${id.nctId ?? ""}`,
      };
    });
  } catch {
    return [];
  }
}

// ─── Research result persistence ────────────────────────────────

import { writeFileSync, readFileSync, existsSync } from "node:fs";

interface PersistedResearch {
  version: string;
  savedAt: string;
  variantFindings: Array<{
    rsid: string;
    gene: string;
    findings: ResearchFinding[];
  }>;
  clinicalTrials?: ClinicalTrial[];
}

/**
 * Save research findings to a JSON file for offline access.
 */
export function saveResearchFindings(
  variants: MatchedVariant[],
  outputPath: string,
  clinicalTrials?: ClinicalTrial[]
): void {
  const data: PersistedResearch = {
    version: "1.0",
    savedAt: new Date().toISOString(),
    variantFindings: variants
      .filter((v) => v.recentFindings && v.recentFindings.length > 0)
      .map((v) => ({
        rsid: v.rsid,
        gene: v.gene,
        findings: v.recentFindings!,
      })),
    clinicalTrials,
  };

  writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

/**
 * Load previously saved research findings and apply them to variants.
 * Returns true if findings were loaded, false if file doesn't exist.
 */
export function loadResearchFindings(
  variants: MatchedVariant[],
  inputPath: string
): boolean {
  if (!existsSync(inputPath)) return false;

  try {
    const raw = readFileSync(inputPath, "utf-8");
    const data: PersistedResearch = JSON.parse(raw);

    const findingsMap = new Map(
      data.variantFindings.map((vf) => [vf.rsid, vf.findings])
    );

    for (const v of variants) {
      const saved = findingsMap.get(v.rsid);
      if (saved) {
        v.recentFindings = saved;
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ─── Provider registry ──────────────────────────────────────────

const PROVIDERS: Record<string, new (...args: any[]) => ResearchProviderImpl> = {
  exa: ExaProvider,
  pubmed: PubMedProvider,
};

// ─── Multi-provider with fallback ───────────────────────────────

/**
 * A composite provider that tries the primary provider first,
 * then falls back to a secondary if no results are found.
 */
export class FallbackProvider implements ResearchProviderImpl {
  name = "fallback";
  private primary: ResearchProviderImpl;
  private secondary: ResearchProviderImpl;

  constructor(primary: ResearchProviderImpl, secondary: ResearchProviderImpl) {
    this.primary = primary;
    this.secondary = secondary;
    this.name = `${primary.name}+${secondary.name}`;
  }

  async search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]> {
    try {
      const results = await this.primary.search(variant, maxResults, minYear);
      if (results.length > 0) return results;
    } catch {
      // Primary failed — try secondary
    }

    try {
      return await this.secondary.search(variant, maxResults, minYear);
    } catch {
      return [];
    }
  }
}

// ─── Research prioritization ────────────────────────────────────

/**
 * Prioritize variants for research based on clinical significance.
 * Returns variants sorted by research priority (highest first).
 * Useful when API call budget is limited.
 */
export function prioritizeForResearch(variants: MatchedVariant[]): MatchedVariant[] {
  const severityScore: Record<string, number> = {
    critical: 10,
    high: 8,
    moderate: 5,
    low: 2,
    protective: 3,
    carrier: 1,
    informational: 0,
  };

  return [...variants]
    .filter((v) => v.riskAlleleCount > 0)
    .sort((a, b) => {
      // Primary: severity
      const sevDiff = (severityScore[b.severity] ?? 0) - (severityScore[a.severity] ?? 0);
      if (sevDiff !== 0) return sevDiff;

      // Secondary: homozygous risk over heterozygous
      const homDiff = (b.riskAlleleCount === 2 ? 1 : 0) - (a.riskAlleleCount === 2 ? 1 : 0);
      if (homDiff !== 0) return homDiff;

      // Tertiary: pharmacogenomics variants get priority (actionable)
      const pgxDiff = (b.category === "pharmacogenomics" ? 1 : 0) - (a.category === "pharmacogenomics" ? 1 : 0);
      return pgxDiff;
    });
}

// ─── Config helpers ─────────────────────────────────────────────

/**
 * Create a research config with sensible defaults.
 * Simplifies the common case of enabling PubMed research.
 */
export function createResearchConfig(overrides: Partial<ResearchConfig> = {}): ResearchConfig {
  return {
    provider: overrides.provider ?? "pubmed",
    maxResultsPerVariant: overrides.maxResultsPerVariant ?? 5,
    minYear: overrides.minYear ?? new Date().getFullYear() - 2,
    enabled: overrides.enabled ?? true,
    apiKey: overrides.apiKey,
  };
}

// ─── Main enrichment function ───────────────────────────────────

/**
 * Enrich matched variants with live research findings.
 *
 * @param variants - Variants to enrich (typically only risk-carrying ones)
 * @param config - Research configuration
 * @returns The same variants array, with `recentFindings` populated
 */
export async function enrichWithResearch(
  variants: MatchedVariant[],
  config: ResearchConfig
): Promise<MatchedVariant[]> {
  if (!config.enabled || config.provider === "none") {
    return variants;
  }

  const ProviderClass = PROVIDERS[config.provider];
  if (!ProviderClass) {
    console.warn(`Unknown research provider: ${config.provider}. Skipping enrichment.`);
    return variants;
  }

  const provider = new ProviderClass(config.apiKey);

  // Only research risk-carrying variants to limit API calls
  const toResearch = variants.filter(
    (v) => v.riskAlleleCount > 0 && (v.severity === "critical" || v.severity === "high")
  );

  console.log(`Researching ${toResearch.length} high-priority variants via ${config.provider}...`);

  // Group by gene to avoid redundant searches
  const geneGroups = new Map<string, MatchedVariant[]>();
  for (const v of toResearch) {
    const group = geneGroups.get(v.gene) ?? [];
    group.push(v);
    geneGroups.set(v.gene, group);
  }

  // Research one representative per gene, then share findings
  const uniqueGeneVariants = [...geneGroups.entries()].map(([, group]) => group[0]);

  // Process with controlled concurrency (respect NCBI rate limits)
  const concurrency = config.apiKey ? 3 : 1; // With API key: 10 req/s, without: 3 req/s
  for (let i = 0; i < uniqueGeneVariants.length; i += concurrency) {
    const batch = uniqueGeneVariants.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((variant) =>
        provider.search(variant, config.maxResultsPerVariant, config.minYear)
      )
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const variant = batch[j];
      if (result.status === "fulfilled") {
        variant.recentFindings = result.value;
      } else {
        console.warn(`Failed to research ${variant.rsid}: ${result.reason?.message ?? "Unknown error"}`);
        variant.recentFindings = [];
      }

      // Share findings with other variants in the same gene
      const sameGene = geneGroups.get(variant.gene) ?? [];
      for (const sibling of sameGene) {
        if (sibling !== variant) {
          sibling.recentFindings = [...(variant.recentFindings ?? [])];
        }
      }
    }
  }

  // Annotate all findings with evidence direction
  annotateEvidenceDirection(variants);

  return variants;
}
