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
_Nothing yet — this is the baseline run._
