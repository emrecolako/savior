# Contributing to genomic-report

## Database contributions

The most impactful way to contribute is expanding the SNP database. Each entry should include:

1. **rsID** — verified against dbSNP
2. **Gene** — HGNC symbol
3. **Risk allele** — oriented to plus strand (matching 23andMe convention)
4. **Condition** — concise description
5. **Category** — one of the defined categories in `types.ts`
6. **Severity** — based on clinical actionability and effect size
7. **Evidence level** — describe the source (meta-analysis, GWAS, single study, etc.)
8. **Odds ratio** — from the most recent/largest study
9. **Notes** — clinical context, drug implications, lifestyle relevance
10. **Sources** — PMIDs or URLs

### Severity guidelines

| Severity | Criteria |
|----------|----------|
| `critical` | FDA/EMA-labelled pharmacogenomic variant, pathogenic (ClinVar), or OR > 3.0 with clinical actionability |
| `high` | OR > 1.5, replicated in meta-analysis, or significant pharmacogenomic impact |
| `moderate` | OR 1.1–1.5, established GWAS association, replicated |
| `low` | OR < 1.1, single study, or preliminary evidence |
| `protective` | Variant reduces disease risk |
| `carrier` | Recessive carrier status |
| `informational` | Traits, non-medical associations |

## Parser contributions

New parsers should:

1. Implement the same return type (`ParsedGenome`)
2. Handle both Unix and Windows line endings
3. Skip no-call genotypes
4. Extract metadata where available
5. Be added to the auto-detection logic in `parsers/index.ts`

## Code style

- TypeScript strict mode
- Explicit return types on exported functions
- JSDoc on all public functions
- No `any` types (use `unknown` + type guards)

## Pull request process

1. Open an issue first for significant changes
2. One feature/fix per PR
3. Include tests for new functionality
4. Update README if adding new features
5. Database additions should include source references
