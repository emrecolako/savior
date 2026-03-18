# Autoresearch: Optimize Research Module & Test Suite

## Objective
Optimize the genomic-report research module and overall test suite for speed and quality. The test suite currently takes ~7.5s, with research tests consuming ~7.25s due to unmocked `sleep()` calls in the PubMed provider. Beyond speed, improve the research module's functionality: better query construction, abstract fetching, deduplication, caching, and error handling.

## Metrics
- **Primary**: total_ms (ms, lower is better) — total test suite execution time
- **Secondary**: test_count — number of passing tests (must not decrease)

## How to Run
`./autoresearch.sh` — runs vitest, outputs `METRIC` lines.

## Files in Scope
- `src/research/index.ts` — Research module (PubMed/Exa providers, enrichment logic, sleep calls)
- `tests/research.test.ts` — Research tests (mock fetch but not sleep)
- `src/analysis/engine.ts` — Core analysis engine (cross-reference, pathways, action items)
- `src/analysis/pathways.ts` — Pathway definitions
- `src/analysis/metabolizers.ts` — Drug-gene interaction matrix
- `src/analysis/prs-engine.ts` — Polygenic risk score engine
- `tests/analysis.test.ts` — Analysis tests
- `tests/parsers.test.ts` — Parser tests
- `tests/prs-engine.test.ts` — PRS tests

## Off Limits
- `data/snp-database.json` — curated database, don't modify
- `data/pgs/` — PGS scoring files
- `src/parsers/` — parsers are stable, don't modify
- `src/ui/` — CLI UI, not relevant
- `src/reports/` — report generators (read-only for context)

## Constraints
- All existing tests must pass (58 tests)
- No new npm dependencies
- Don't break the public API (`enrichWithResearch`, `PubMedProvider`, `ExaProvider`)
- Privacy principle: genome data never leaves the machine

## What's Been Tried

### ✅ Wins
1. **Mock sleep in tests** — Exported setSleep/resetSleep from research module. Tests: 7540ms → 372ms (95% reduction)
2. **Better PubMed queries** — tiab/gene field qualifiers, MeSH human filter, star-allele annotation stripping
3. **Title deduplication** — Normalized title matching prevents duplicate papers
4. **Author summaries** — Include first 3 authors + "et al." in finding summaries
5. **Gene-level deduplication** — Skip redundant API calls for variants in same gene, share findings
6. **Concurrent batch processing** — Promise.allSettled with controlled concurrency (1 without API key, 3 with)
7. **Relevance scoring** — Score by rsID mention, gene, condition keywords, journal impact, meta-analysis bonus, recency
8. **In-memory result caching** — PubMedProvider caches by variant+params, returns copies to prevent mutation
9. **Abstract fetching** — PubMed efetch API for rich summaries, XML parser with structured label support, HTML stripping

10. **Exa provider implementation** — Full neural search provider with query builder, caching, error handling (no longer a stub)
11. **Research summary generator** — Generates cohesive narrative from findings, grouped by gene
12. **Library exports** — All new functions properly exported from index.ts

13. **FallbackProvider** — Composite provider with automatic fallback from primary to secondary
14. **AbortController timeouts** — 10s timeout on all fetch calls to prevent hanging
15. **Library exports** — Full public API for all new research functions

16. **Evidence direction classification** — Keyword-based grading: supports-risk, protective, neutral, uncertain
17. **RateLimiter class** — Token-bucket algorithm replaces raw sleep(350) calls
18. **Vitest parallel config** — pool=threads, fileParallelism=true (204ms → from 355ms)
19. **ClinicalTrials.gov search** — Search active/recruiting trials by gene+condition via v2 API
20. **Research persistence** — Save/load findings to JSON for offline access
21. **Enhanced summary** — Evidence direction breakdown and direction tags per gene
22. **PMC URL extraction** — Detect pmcid from esummary for open access full text
23. **Integration test** — Full snp-database.json cross-reference + severity sort validation

24. **PMC URL extraction** — Detect pmcid from esummary for open access full text links
25. **Variant research brief** — One-liner evidence summary per variant
26. **Research prioritization** — Sort variants by research urgency for API budget optimization
27. **Config helper** — createResearchConfig with sensible defaults
28. **End-to-end tests** — Full analyse() pipeline + executive summary validation

### ❌ Dead Ends
- Pre-computed pathway matchers (WeakMap/Set) — overhead exceeds benefit on small datasets
- vitest pool=forks — slower than threads for 4 test files
- vitest concurrent=true — shared mock state causes flaky tests
- minThreads=8 — diminishing returns, sweet spot is 4

29. **Research landscape overview** — One-paragraph summary for reports
30. **Research gaps detection** — Identifies high-priority variants without research
31. **Abstract fetch test** — End-to-end efetch XML → summary population

### Current State
- 119 tests, ~190-220ms (97%+ faster than baseline of 7540ms)  
- Tests more than doubled (+105%)
- Full research module: PubMed + Exa + Fallback providers, queries, dedup, caching, abstract fetching, relevance scoring, evidence grading, summaries, clinical trials, persistence, rate limiting, timeouts, PMC links, prioritization, research gaps, landscape overview
