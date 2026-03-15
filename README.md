# 🧬 genomic-report

Comprehensive personal genomic analysis toolkit. Parse raw DNA data from 23andMe, AncestryDNA, or VCF files, cross-reference against a curated database of clinically significant variants, and generate actionable reports.

## What it does

1. **Parses** raw genome files (23andMe v4/v5, AncestryDNA, VCF) — auto-detects format
2. **Cross-references** your ~640K SNPs against a database of **1,500 clinically significant variants** sourced from ClinVar, Open Targets, GWAS Catalog, PharmGKB, CPIC, SNPedia, and published meta-analyses
3. **Determines** APOE genotype (Alzheimer's/cardiovascular risk stratification)
4. **Detects pathway convergence** — where multiple risk alleles cluster on the same biological system (e.g., 14 variants converging on coronary artery disease)
5. **Generates prioritised action items** — screening recommendations, pharmacist alert card content, lifestyle/supplement considerations
6. **Outputs** structured reports in Markdown, JSON, DOCX (coming soon), or HTML (coming soon)

## Quick start

```bash
# Clone and install
git clone https://github.com/yourusername/genomic-report.git
cd genomic-report
npm install

# Run against your 23andMe data
npx tsx src/cli.ts analyse -i ~/Downloads/genome_data.txt -n "Your Name"

# Output: report.md (default)
```

## Usage

### CLI

```bash
# Basic analysis → Markdown report
npx tsx src/cli.ts analyse -i genome.txt -o report.md

# JSON output (for piping into other tools)
npx tsx src/cli.ts analyse -i genome.txt -o report.json -r json

# Custom name, risk-alleles only, high severity minimum
npx tsx src/cli.ts analyse -i genome.txt -n "Jane Doe" --risk-only --min-severity high

# Use a custom/extended SNP database
npx tsx src/cli.ts analyse -i genome.txt -d ./my-extended-db.json

# Merge supplementary databases
npx tsx src/cli.ts analyse -i genome.txt --supplementary ./pharma-extra.json ./rare-diseases.json

# Database info
npx tsx src/cli.ts info
```

### As a library

```typescript
import { parseGenome, loadDatabase, analyse, generateReport } from "genomic-report";

const genome = parseGenome("./my-23andme-data.txt");
const db = loadDatabase();
const result = analyse(genome, db);

// Access results programmatically
console.log(`APOE: ${result.apoe.diplotype}`);
console.log(`Risk variants: ${result.variants.filter(v => v.riskAlleleCount > 0).length}`);
console.log(`High-risk pathways: ${result.pathways.filter(p => p.riskLevel === "high").length}`);

// Generate report
generateReport(result, {
  format: "markdown",
  outputPath: "./report.md",
  includeSummary: true,
  includeRawVariants: true,
  includePathways: true,
  includeActionItems: true,
  includeRecentLiterature: false,
  includeMethodology: true,
  subjectName: "Jane Doe",
});
```

## Architecture

```
genomic-report/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── index.ts            # Library exports
│   ├── types.ts            # All type definitions
│   ├── parsers/
│   │   ├── index.ts        # Auto-detection + dispatch
│   │   ├── twentythree-and-me.ts
│   │   └── ancestrydna.ts
│   ├── database/
│   │   └── loader.ts       # Load + merge SNP databases
│   ├── analysis/
│   │   └── engine.ts       # Cross-reference, APOE, pathways, actions
│   ├── reports/
│   │   ├── index.ts        # Report dispatcher
│   │   ├── markdown.ts     # Markdown report generator
│   │   └── json.ts         # JSON export
│   └── research/           # (Planned) Live literature search
├── data/
│   └── snp-database.json   # Curated SNP database (1,500 entries)
├── tests/
├── docs/
└── scripts/
    ├── expand-db.ts       # Automated DB expansion (ClinVar + Open Targets)
    ├── db-stats.ts        # Print database statistics
    └── validate-db.ts     # Validate database entries
```

## SNP database

The built-in database (`data/snp-database.json`) covers **1,500 clinically significant variants** across 19 categories:

| Category | Count | Examples |
|----------|------:|----------|
| **Oncology** | 198 | BRCA2, CDKN2A, RET, FGFR2, 8q24, SMAD7, TERT, MC1R |
| **Cardiovascular** | 107 | 9p21.3 (CAD), PITX2 (AF), LPA, PCSK9, LDLR, Factor V Leiden, MYL4 |
| **Autoimmune** | 101 | HLA-DRB1, PTPN22, CTLA4, NOD2, ATG16L1, IL23R, CD40 |
| **Metabolic** | 65 | TCF7L2, FTO, MC4R, PPARG, KCNJ11 |
| **Neurological** | 45 | APOE, BDNF, LRRK2, SNCA |
| **Ophthalmological** | 41 | CFH, ARMS2, complement pathway, CA4 |
| **Hematological** | 38 | VWF, Factor V Leiden, HFE, thalassemia variants |
| **Pharmacogenomics** | 36 | CYP2D6, CYP2C9, CYP2C19, DPYD, TPMT, SLCO1B1, VKORC1, ABCB1 |
| **Pulmonary** | 36 | CFTR, SERPINA1, asthma-associated loci |
| **Nutrigenomic** | 15 | MTHFR, LCT/MCM6, VDR pathway, DAO/HNMT |
| **Musculoskeletal** | 13 | RYR1, osteoarthritis loci |
| **Psychiatric** | 9 | Schizophrenia, bipolar, COMT |
| **And more** | 18 | Dermatological, hepatic, renal, reproductive, longevity, traits |

The database is assembled from three sources:
- **199 hand-curated entries** — strongest-evidence variants from PharmGKB, CPIC, GWAS Catalog, SNPedia, and published meta-analyses
- **~1,000 entries from ClinVar** — pathogenic, likely pathogenic, drug response, risk factor, and protective variants with expert panel or multiple-submitter review status
- **~280 entries via Open Targets** — gene-disease associations cross-referenced back to ClinVar for variant-level evidence

### Automated expansion

The database can be expanded further using the built-in script, which fetches from ClinVar and Open Targets APIs (no API keys needed):

```bash
# Expand to 2,000 entries
npx tsx scripts/expand-db.ts --limit 2000

# Preview without writing
npx tsx scripts/expand-db.ts --dry-run

# Database stats
npm run db:stats

# Validate entries
npm run db:validate
```

### Extending the database manually

Create a JSON file matching the `SnpDatabase` schema:

```json
{
  "version": "custom-1.0",
  "lastUpdated": "2026-03-15",
  "entries": [
    {
      "rsid": "rs12345678",
      "gene": "MY_GENE",
      "riskAllele": "A",
      "condition": "My condition of interest",
      "category": "cardiovascular",
      "severity": "moderate",
      "evidenceLevel": "Single GWAS",
      "oddsRatio": "1.15",
      "notes": "Clinical context and implications.",
      "tags": ["custom", "research"]
    }
  ]
}
```

Then use it:

```bash
# Replace the built-in database
npx tsx src/cli.ts analyse -i genome.txt -d ./my-db.json

# Or merge with the built-in
npx tsx src/cli.ts analyse -i genome.txt --supplementary ./my-db.json
```

## Roadmap

- [x] 23andMe v4/v5 parser
- [x] AncestryDNA parser
- [x] Core cross-reference engine
- [x] APOE genotype determination
- [x] Pathway convergence detection
- [x] Action item generation
- [x] Markdown report
- [x] JSON export
- [ ] DOCX report (professional Word document)
- [ ] HTML report (interactive, with charts)
- [ ] VCF parser
- [ ] Research module (Exa/PubMed integration for live literature search)
- [ ] Polygenic risk score calculations
- [ ] Population-specific allele frequency adjustments
- [ ] Web UI
- [ ] MCP server (expose as tool for Claude/AI agents)

## Privacy & data handling

**Your genome data never leaves your machine.** This is a strict design principle.

- **No data collection.** No telemetry, analytics, or tracking of any kind.
- **No network calls during analysis.** The entire parse → cross-reference → report pipeline runs locally. No external APIs are contacted when you analyse your genome.
- **No storage beyond your output file.** Genome data is held in memory only for the duration of the analysis. The only file written is the report you explicitly request (e.g. `report.md`). No temp files, caches, or logs contain your data.
- **No credentials required.** Core analysis needs no API keys or accounts.
- **Database expansion is separate.** The `scripts/expand-db.ts` script contacts public APIs (ClinVar, Open Targets) to expand the *reference* SNP database — it sends medical search queries (gene names, disease terms), never your genotype data.
- **`.gitignore` blocks genome files.** Raw `.txt` and `.vcf` files are excluded from version control by default. Never commit raw genome data to a repository.

## Important disclaimers

⚠️ **This tool is for research and educational purposes only.** It is NOT a clinical diagnosis tool.

**Not medical advice.** This software does not provide medical advice, diagnosis, or treatment recommendations. No doctor-patient, genetic-counsellor-client, or other professional relationship is created by using this tool. The output should never be used as a substitute for professional medical judgement.

**No warranty.** This software is provided "as-is" under the MIT License, without warranty of any kind. The authors and contributors are not liable for any damages, health outcomes, or decisions made based on the output of this tool. See [LICENSE](./LICENSE) for full terms.

**No guarantee of accuracy.** The SNP database is community-curated from public sources (ClinVar, GWAS Catalog, PharmGKB, SNPedia, Open Targets). No guarantee is made regarding the accuracy, completeness, or timeliness of variant annotations, odds ratios, or risk classifications. Errors, omissions, and outdated information may be present.

**Not regulatory approved.** This tool has not been evaluated, cleared, or approved by the FDA, EMA, or any other regulatory body. It is not a validated clinical or diagnostic device.

**User responsibility.** You are solely responsible for how you interpret and act on the results. Always consult a qualified healthcare provider or certified genetic counsellor before making any medical decisions based on genetic data.

### Technical limitations

- Consumer genotyping arrays (23andMe, AncestryDNA) cover ~640K of ~10M+ common variants and cannot detect structural variants, CNVs, or repeat expansions
- Odds ratios are population-level statistics — individual risk depends on environment, lifestyle, and gene-gene interactions
- HLA typing from tag SNPs is approximate
- Carrier screening coverage on consumer arrays is limited

## Contributing

Contributions are very welcome, especially:

1. **Database expansion** — adding new clinically validated SNPs with proper sourcing
2. **Parser support** — VCF, MyHeritage, Nebula Genomics, etc.
3. **Report formats** — DOCX, HTML with interactive visualizations
4. **Research integration** — PubMed API for live literature search (ClinVar + Open Targets already integrated for DB expansion)
5. **Population-specific adjustments** — allele frequencies vary by ancestry
6. **Tests** — unit and integration tests for all modules

Please open an issue first to discuss significant changes.

## License

MIT
