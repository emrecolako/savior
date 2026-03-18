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

import type { MatchedVariant, ResearchFinding, ResearchConfig } from "../types.js";

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

async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (attempt < retries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]> {
    console.warn(`[exa] Exa provider not yet implemented. Skipping ${variant.rsid}.`);
    return [];
  }
}

// ─── PubMed provider (stub) ─────────────────────────────────────

export class PubMedProvider implements ResearchProviderImpl {
  name = "pubmed";
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
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
    const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

    const query = this.buildQuery(variant, minYear);

    // Request extra results to allow deduplication, sort by relevance
    const fetchCount = Math.min(maxResults * 2, 20);
    let searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${fetchCount}&sort=relevance&retmode=json`;
    if (this.apiKey) searchUrl += `&api_key=${this.apiKey}`;

    const searchData = await fetchWithRetry(searchUrl);
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    await sleep(350); // NCBI rate limit: 3 req/s without API key

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

      results.push({
        title,
        source: article.source ?? "Unknown journal",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        date: article.pubdate ?? "Unknown date",
        summary,
      });

      // Stop once we have enough deduplicated results
      if (results.length >= maxResults) break;
    }

    await sleep(350);

    // Sort by relevance score (highest first)
    return results.sort((a, b) => scoreRelevance(b, variant) - scoreRelevance(a, variant));
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

// ─── Provider registry ──────────────────────────────────────────

const PROVIDERS: Record<string, new (...args: any[]) => ResearchProviderImpl> = {
  exa: ExaProvider,
  pubmed: PubMedProvider,
};

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

  return variants;
}
