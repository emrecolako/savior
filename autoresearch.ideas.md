# Autoresearch Ideas

## Done
- [x] ~~Implement Exa provider~~
- [x] ~~Multi-provider fallback~~
- [x] ~~Evidence direction classification~~
- [x] ~~Rate limiter with token bucket~~
- [x] ~~Clinical trials search (ClinicalTrials.gov)~~
- [x] ~~Research result persistence~~
- [x] ~~Vitest parallel config optimization~~

## Remaining
- [ ] Fetch full-text from PMC Open Access for richer summaries (check pmcid in esummary)
- [ ] Add integration test with real snp-database.json (larger cross-reference coverage)
- [ ] Optimize tsc --noEmit pre-check (~0.8s overhead per run, not in metric but in wall time)
- [ ] Add research enrichment to generateResearchSummary — include evidence direction counts
- [ ] PMC link extraction — when efetch returns PMCID, generate PMC URL for free full text
