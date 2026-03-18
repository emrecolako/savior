# Autoresearch Ideas

- [ ] Implement Exa provider (currently a stub) for broader web search including preprints
- [ ] Add rate limiter class with token bucket for clean NCBI rate limiting
- [ ] Research result persistence — save findings to disk alongside report for offline access
- [ ] Add MeSH term enrichment — map gene names to MeSH ontology for better PubMed queries
- [ ] Parallel pathway detection — run pathway matching concurrently since they're independent
- [ ] Cross-reference engine: pre-index database by rsID for O(1) lookup (currently O(n) scan)
- [ ] Add clinical trial search via ClinicalTrials.gov API for actionable trials per variant
- [ ] Implement research summary generator — aggregate findings across variants into cohesive paragraph
