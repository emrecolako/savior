# Autoresearch Ideas

## Done (all major features shipped)
- [x] Exa provider, FallbackProvider, evidence grading, rate limiter, clinical trials
- [x] Persistence, PMC links, summaries, research gaps, mergeFindings, prioritization
- [x] Vitest optimization (threads, parallelism, minThreads=4)
- [x] Comprehensive test coverage: 138 tests across all modules

## Fresh angles to explore
- [ ] Batch PubMed search — single esearch with OR'd rsIDs instead of one-per-variant (fewer API calls)
- [ ] Preprint detection — flag findings from bioRxiv/medRxiv vs peer-reviewed journals
- [ ] Research age warning — flag findings older than 3 years as potentially outdated
- [ ] Variant annotation enrichment — add dbSNP/ClinVar links to matched variants
- [ ] Pathway narrative quality — improve fillNarrative templates with more dynamic text
- [ ] Test: verify Exa provider handles rate limits / network errors gracefully
- [ ] Test: verify abstract truncation at 300 chars works correctly
