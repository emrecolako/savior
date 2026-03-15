#!/usr/bin/env node

import { Command } from "commander";
import { parseGenome } from "./parsers/index.js";
import { loadDatabase } from "./database/loader.js";
import { analyse } from "./analysis/engine.js";
import { generateReport, writeGpCard, writeGpCardJsonFile } from "./reports/index.js";
import type { ReportFormat, InputFormat, Severity, Category } from "./types.js";
import {
  printBanner,
  printCompactBanner,
  ProgressTracker,
  createSnpCounter,
  apoePanel,
  pgxAlertPanel,
  criticalAlertBox,
  pathwaySummaryPanel,
  actionItemsPanel,
  variantSummaryLine,
  errorPanel,
  dim,
  completionBox,
  prsTable,
  severityBreakdownTable,
  categoryBreakdownTable,
  pgxMatrixTable,
  printDashboard,
} from "./ui/index.js";

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
      await printBanner();

      const totalSteps = opts.research ? 5 : 4;
      const progress = new ProgressTracker(totalSteps);

      // Step 1: Parse genome
      const spin1 = progress.nextStep("Parsing genome file");
      const genome = parseGenome(opts.input, opts.format as InputFormat | undefined);
      progress.complete(spin1, `${genome.totalSnps.toLocaleString()} SNPs loaded (${genome.format}, ${genome.buildVersion})`);

      // Step 2: Load database
      const spin2 = progress.nextStep("Loading SNP database");
      const db = loadDatabase(opts.database, opts.supplementary);
      progress.complete(spin2, `${db.entries.length.toLocaleString()} entries loaded`);

      // Step 3: Analyse
      const spin3 = progress.nextStep("Analysing variants");
      const counter = createSnpCounter(db.entries.length);
      spin3.stop();

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
      } as any, (current, total) => {
        counter.update(current);
      });

      counter.finish();
      spin3.start();
      progress.complete(spin3, `${result.matchedCount} clinically significant variants`);

      // Display results
      console.log("");
      console.log(`  ${variantSummaryLine(result.variants)}`);
      console.log("");

      // APOE panel
      console.log(apoePanel(result.apoe));
      console.log("");

      // Critical findings (cap at 5 to avoid wall of red)
      const MAX_ALERTS = 5;
      const criticalVariants = result.variants.filter((v) => v.severity === "critical");
      const urgentActions = result.actionItems.filter((a) => a.priority === "urgent");
      const totalAlerts = criticalVariants.length + urgentActions.length;

      for (const v of criticalVariants.slice(0, MAX_ALERTS)) {
        console.log(criticalAlertBox(
          `CRITICAL: ${v.gene} — ${v.condition}`,
          `${v.rsid} ${v.genotype} (${v.zygosity}). ${v.notes}`
        ));
        console.log("");
      }

      const urgentSlots = Math.max(0, MAX_ALERTS - criticalVariants.length);
      for (const a of urgentActions.slice(0, urgentSlots)) {
        console.log(criticalAlertBox(`URGENT: ${a.title}`, a.detail));
        console.log("");
      }

      if (totalAlerts > MAX_ALERTS) {
        const remaining = totalAlerts - MAX_ALERTS;
        console.log(dim(`  … and ${remaining} more critical/urgent finding${remaining > 1 ? "s" : ""} in the full report\n`));
      }

      // PGx panel
      console.log(pgxAlertPanel(result.pharmacogenomics.genes));
      console.log("");

      // Pathway summary
      if (opts.pathways !== false && result.pathways.length > 0) {
        console.log(pathwaySummaryPanel(result.pathways));
        console.log("");
      }

      // PRS table
      if (result.prs && result.prs.traits.length > 0) {
        console.log(prsTable(result.prs.traits));
      }

      // Research enrichment (optional step)
      if (opts.research) {
        const spin4 = progress.nextStep("Enriching with PubMed research");
        const { enrichWithResearch } = await import("./research/index.js");
        await enrichWithResearch(result.variants, {
          provider: opts.researchProvider as any,
          apiKey: process.env.PUBMED_API_KEY,
          maxResultsPerVariant: Number(opts.maxResearch) || 3,
          minYear: new Date().getFullYear() - 2,
          enabled: true,
        });
        const enriched = result.variants.filter(v => v.recentFindings && v.recentFindings.length > 0);
        progress.complete(spin4, `Found research for ${enriched.length} variant(s)`);
      }

      // Generate report
      const spinReport = progress.nextStep("Generating report");
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
      progress.complete(spinReport, `${opts.reportFormat} → ${opts.output}`);

      // Final dashboard
      await printDashboard(result, opts.output, progress.elapsed());

    } catch (err: any) {
      console.log("");
      console.log(errorPanel(err.message));
      console.log("");
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Show information about the SNP database")
  .option("-d, --database <path>", "Path to custom SNP database JSON")
  .action(async (opts) => {
    await printCompactBanner("🧬", "SNP Database Info");

    const progress = new ProgressTracker(1);
    const spin = progress.nextStep("Loading SNP database");
    const db = loadDatabase(opts.database);
    progress.complete(spin, `${db.entries.length.toLocaleString()} entries (v${db.version}, updated ${db.lastUpdated})`);

    console.log("");
    console.log(categoryBreakdownTable(db.entries));
    console.log(severityBreakdownTable(
      db.entries.map((e) => ({
        ...e,
        chromosome: "",
        position: 0,
        genotype: "",
        zygosity: "unknown" as const,
        riskAlleleCount: 0,
      }))
    ));
  });

program
  .command("gp-card")
  .description("Generate a pharmacogenomics GP alert card (standalone, hand to your doctor)")
  .requiredOption("-i, --input <path>", "Path to raw genome file")
  .option("-f, --format <format>", "Input format: 23andme, ancestrydna, vcf, generic-tsv")
  .option("-o, --output <path>", "Output file path", "gp-card.md")
  .option("-r, --report-format <format>", "Card format: markdown or json", "markdown")
  .option("-n, --name <name>", "Patient name for the card", "Patient")
  .option("-d, --database <path>", "Path to custom SNP database JSON")
  .option("--supplementary <paths...>", "Additional SNP database files to merge")
  .action(async (opts) => {
    try {
      await printCompactBanner("💊", "Pharmacogenomics GP Card Generator");

      const progress = new ProgressTracker(3);

      // Step 1: Parse
      const spin1 = progress.nextStep("Parsing genome file");
      const genome = parseGenome(opts.input, opts.format as InputFormat | undefined);
      progress.complete(spin1, `${genome.totalSnps.toLocaleString()} SNPs (${genome.format})`);

      // Step 2: Load DB
      const spin2 = progress.nextStep("Loading SNP database");
      const db = loadDatabase(opts.database, opts.supplementary);
      progress.complete(spin2, `${db.entries.length.toLocaleString()} entries`);

      // Step 3: Analyse
      const spin3 = progress.nextStep("Analysing pharmacogenomics profile");
      const result = analyse(genome, db, {
        input: { filePath: opts.input },
      } as any);
      progress.complete(spin3, `${result.pharmacogenomics.genes.length} enzymes profiled`);

      console.log("");

      // PGx panel
      console.log(pgxAlertPanel(result.pharmacogenomics.genes));
      console.log("");

      // PGx matrix
      console.log(pgxMatrixTable(result.pharmacogenomics));

      // Write output
      if (opts.reportFormat === "json") {
        writeGpCardJsonFile(result, opts.output, opts.name);
      } else {
        writeGpCard(result, opts.output, opts.name);
      }

      console.log(completionBox(opts.output, progress.elapsed(), opts.reportFormat));
      console.log("");

    } catch (err: any) {
      console.log("");
      console.log(errorPanel(err.message));
      console.log("");
      process.exit(1);
    }
  });

program.parse();
