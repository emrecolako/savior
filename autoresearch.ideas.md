# Autoresearch Ideas

## Done
- [x] ~~Implement Exa provider~~
- [x] ~~Multi-provider fallback~~

## Next Up
- [ ] Add variant-specific evidence grading — classify findings as "supports risk", "protective", "neutral"
- [ ] Rate limiter class with token bucket — cleaner NCBI rate limiting, replace raw sleep()
- [ ] Add clinical trial search via ClinicalTrials.gov API for actionable trials per variant
- [ ] Fetch full-text from PMC Open Access for richer summaries (check pmcid in esummary)
- [ ] Optimize vitest config — pool threads, isolate false, reduce transform overhead (~130ms)
- [ ] Add integration test with real snp-database.json (larger cross-reference coverage)
- [ ] Research result persistence — save/load findings to JSON alongside report
