#!/usr/bin/env node

import { Command } from "commander";
import { parseGenome } from "./parsers/index.js";
import { loadDatabase } from "./database/loader.js";
import { analyse } from "./analysis/engine.js";
import { generateReport } from "./reports/index.js";
import type { ReportFormat, InputFormat, Severity, Category } from "./types.js";

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const program = new Command();

program
  .name("genomic-report")
  .description("Comprehensive personal genomic analysis — parse raw DNA data, cross-reference clinically significant variants, generate actionable reports.")
  .version("0.1.0");

program
  .command("analyse")
  .alias("analyze")
  .description("Analyse a raw genome file and generate a report")
  .requiredOption("-i, --input <path>", "Path to raw genome file (23andMe, AncestryDNA, etc.)")
  .option("-f, --format <format>", "Input format: 23andme, ancestrydna, vcf, generic-tsv (auto-detected if omitted)")
  .option("-o, --output <path>", "Output file path", "report.md")
  .option("-r, --report-format <format>", "Report format: markdown, json, docx, html", "markdown")
  .option("-n, --name <name>", "Subject name for the report", "Subject")
  .option("-d, --database <path>", "Path to custom SNP database JSON")
  .option("--supplementary <paths...>", "Additional SNP database files to merge")
  .option("--min-severity <severity>", "Minimum severity to include: critical, high, moderate, low, protective, carrier, informational")
  .option("--categories <categories...>", "Filter to specific categories")
  .option("--risk-only", "Only show variants where risk allele is present", false)
  .option("--no-summary", "Omit the plain-English summary section")
  .option("--no-pathways", "Omit pathway convergence analysis")
  .option("--no-actions", "Omit prioritised action list")
  .option("--no-prs", "Skip polygenic risk score computation")
  .option("--prs-traits <traits...>", "Specific PRS traits to compute (default: all)")
  .option("--pgs-data <path>", "Path to custom PGS scoring data directory")
  .option("--research", "Enrich findings with live PubMed research (requires internet)")
  .option("--research-provider <provider>", "Research provider: pubmed", "pubmed")
  .option("--max-research <n>", "Max research results per variant", "3")
  .action(async (opts) => {
    try {
      console.log(`\n🧬 genomic-report v0.1.0\n`);
      console.log(`Parsing: ${opts.input}`);

      const genome = parseGenome(opts.input, opts.format as InputFormat | undefined);
      console.log(`  Format:  ${genome.format}`);
      console.log(`  Build:   ${genome.buildVersion}`);
      console.log(`  SNPs:    ${genome.totalSnps.toLocaleString()}\n`);

      console.log(`Loading SNP database...`);
      const db = loadDatabase(opts.database, opts.supplementary);
      console.log(`  Entries: ${db.entries.length}\n`);

      console.log(`Analysing...`);
      const result = analyse(genome, db, {
        input: { filePath: opts.input },
        prs: {
          enabled: opts.prs !== false,
          traits: opts.prsTraits as string[] | undefined,
          scoringDataPath: opts.pgsData as string | undefined,
        },
        filters: {
          minSeverity: opts.minSeverity as Severity | undefined,
          categories: opts.categories as Category[] | undefined,
          onlyRiskAlleles: opts.riskOnly,
        },
      } as any);

      console.log(`  Matched: ${result.matchedCount} clinically significant variants`);
      console.log(`  APOE:    ${result.apoe.diplotype}`);
      console.log(`  Pathways: ${result.pathways.length} convergent pathways detected`);
      console.log(`  Actions: ${result.actionItems.length} action items generated`);

      if (result.prs && result.prs.traits.length > 0) {
        console.log(`\nPolygenic Risk Scores:`);
        for (const t of result.prs.traits) {
          const pct = Math.round(t.percentile);
          const cat = t.riskCategory.toUpperCase().padEnd(13);
          const coverage = `${t.variantsUsed}/${t.variantsTotal}`;
          console.log(`  ${t.traitName.padEnd(30)} ${String(pct).padStart(3)}${ordinalSuffix(pct)} percentile (${cat}) [${coverage} variants]`);
        }
      }
      console.log("");

      if (opts.research) {
        console.log("Researching variants via PubMed...");
        const { enrichWithResearch } = await import("./research/index.js");
        await enrichWithResearch(result.variants, {
          provider: opts.researchProvider as any,
          apiKey: process.env.PUBMED_API_KEY,
          maxResultsPerVariant: Number(opts.maxResearch) || 3,
          minYear: new Date().getFullYear() - 2,
          enabled: true,
        });
        const enriched = result.variants.filter(v => v.recentFindings && v.recentFindings.length > 0);
        console.log(`  Found research for ${enriched.length} variant(s)\n`);
      }

      console.log(`Generating ${opts.reportFormat} report → ${opts.output}`);
      generateReport(result, {
        format: opts.reportFormat as ReportFormat,
        outputPath: opts.output,
        includeSummary: opts.summary !== false,
        includeRawVariants: true,
        includePathways: opts.pathways !== false,
        includeActionItems: opts.actions !== false,
        includeRecentLiterature: !!opts.research,
        includeMethodology: true,
        includePrs: opts.prs !== false,
        subjectName: opts.name,
      });

      console.log(`✅ Done.\n`);
    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message}\n`);
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Show information about the SNP database")
  .option("-d, --database <path>", "Path to custom SNP database JSON")
  .action((opts) => {
    const db = loadDatabase(opts.database);
    console.log(`\n🧬 SNP Database Info\n`);
    console.log(`  Version:  ${db.version}`);
    console.log(`  Updated:  ${db.lastUpdated}`);
    console.log(`  Entries:  ${db.entries.length}\n`);

    // Category breakdown
    const cats = new Map<string, number>();
    const sevs = new Map<string, number>();
    for (const e of db.entries) {
      cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
      sevs.set(e.severity, (sevs.get(e.severity) ?? 0) + 1);
    }

    console.log(`  By category:`);
    for (const [cat, count] of [...cats.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat.padEnd(20)} ${count}`);
    }

    console.log(`\n  By severity:`);
    for (const [sev, count] of [...sevs.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${sev.padEnd(20)} ${count}`);
    }
    console.log("");
  });

program.parse();
