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

  async search(variant: MatchedVariant, maxResults: number, minYear?: number): Promise<ResearchFinding[]> {
    const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

    // Build query: rsid OR (gene AND condition)
    let query = `"${variant.rsid}" OR ("${variant.gene}" AND "${variant.condition}")`;
    if (minYear) {
      query += ` AND ${minYear}:3000[dp]`;
    }

    let searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
    if (this.apiKey) searchUrl += `&api_key=${this.apiKey}`;

    const searchData = await fetchWithRetry(searchUrl);
    const pmids: string[] = searchData?.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    await sleep(350); // NCBI rate limit: 3 req/s without API key

    let summaryUrl = `${BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
    if (this.apiKey) summaryUrl += `&api_key=${this.apiKey}`;

    const summaryData = await fetchWithRetry(summaryUrl);
    const results: ResearchFinding[] = [];

    for (const pmid of pmids) {
      const article = summaryData?.result?.[pmid];
      if (!article) continue;
      results.push({
        title: article.title ?? "Untitled",
        source: article.source ?? "Unknown journal",
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        date: article.pubdate ?? "Unknown date",
        summary: article.title ?? "",
      });
    }

    await sleep(350);
    return results;
  }
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

  for (const variant of toResearch) {
    try {
      variant.recentFindings = await provider.search(
        variant,
        config.maxResultsPerVariant,
        config.minYear
      );
    } catch (err: any) {
      console.warn(`Failed to research ${variant.rsid}: ${err.message}`);
      variant.recentFindings = [];
    }
  }

  return variants;
}
