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
    // TODO: Implement Exa API integration
    //
    // Suggested query strategy:
    //   1. Search for rsid directly: "rs1799853 CYP2C9 warfarin 2025"
    //   2. Search for gene + condition: "CYP2C9 warfarin sensitivity pharmacogenomics"
    //   3. Search for pathway if convergent: "CYP2C9 VKORC1 warfarin dosing algorithm"
    //
    // API endpoint: https://api.exa.ai/search
    //
    // Example:
    //   const response = await fetch("https://api.exa.ai/search", {
    //     method: "POST",
    //     headers: { "x-api-key": this.apiKey, "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       query: `${variant.rsid} ${variant.gene} ${variant.condition} ${minYear ?? 2024}`,
    //       numResults: maxResults,
    //       type: "auto",
    //       contents: { text: { maxCharacters: 2000 } },
    //     }),
    //   });

    console.warn(`[exa] Research module not yet implemented. Skipping ${variant.rsid}.`);
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
    // TODO: Implement PubMed E-utilities integration
    //
    // 1. ESearch: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi
    //    ?db=pubmed&term=${variant.rsid}+AND+${minYear}[dp]&retmax=${maxResults}
    //
    // 2. ESummary for each PMID to get title, source, date
    //
    // 3. Map to ResearchFinding[]

    console.warn(`[pubmed] Research module not yet implemented. Skipping ${variant.rsid}.`);
    return [];
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
