/**
 * Core type definitions for genomic-report.
 *
 * Design principle: every type is serialisable to JSON so the full
 * analysis pipeline can be checkpointed, cached, and resumed.
 */

// ─── Input formats ──────────────────────────────────────────────

export type InputFormat = "23andme" | "ancestrydna" | "vcf" | "generic-tsv";

export interface RawGenotype {
  rsid: string;
  chromosome: string;
  position: number;
  genotype: string; // e.g. "AG", "TT", "--", "DI"
}

export interface ParsedGenome {
  format: InputFormat;
  buildVersion: string; // e.g. "GRCh37", "GRCh38"
  totalSnps: number;
  snps: Map<string, RawGenotype>; // keyed by rsid
  metadata: Record<string, string>; // anything the parser extracts (date, chip version, etc.)
}

// ─── SNP database ───────────────────────────────────────────────

export type Severity = "critical" | "high" | "moderate" | "low" | "protective" | "carrier" | "informational";

export type Category =
  | "pharmacogenomics"
  | "cardiovascular"
  | "metabolic"
  | "neurological"
  | "autoimmune"
  | "oncology"
  | "nutrigenomic"
  | "carrier"
  | "ophthalmological"
  | "hepatic"
  | "renal"
  | "pulmonary"
  | "musculoskeletal"
  | "hematological"
  | "dermatological"
  | "psychiatric"
  | "reproductive"
  | "longevity"
  | "trait"
  | "other";

export interface SnpEntry {
  rsid: string;
  gene: string;
  aliases?: string[];              // other rsids in LD
  riskAllele: string;              // e.g. "A", "varies"
  condition: string;               // short description
  category: Category;
  severity: Severity;
  evidenceLevel: string;           // e.g. "PharmGKB Level 1A", "GWAS meta-analysis"
  oddsRatio?: string;              // free-text, e.g. "1.37 per allele"
  sources?: string[];              // PMIDs, URLs
  notes: string;                   // clinical context
  tags?: string[];                 // free-form tags for filtering/grouping
  population?: string;             // if population-specific
  lastUpdated?: string;            // ISO date
}

export interface SnpDatabase {
  version: string;
  lastUpdated: string;
  entries: SnpEntry[];
}

// ─── Analysis results ───────────────────────────────────────────

export type Zygosity = "homozygous" | "heterozygous" | "hemizygous" | "unknown";

export interface MatchedVariant {
  // From user's data
  rsid: string;
  chromosome: string;
  position: number;
  genotype: string;
  zygosity: Zygosity;

  // From database
  gene: string;
  riskAllele: string;
  riskAlleleCount: number;         // 0, 1, 2, or -1 if undetermined
  condition: string;
  category: Category;
  severity: Severity;
  evidenceLevel: string;
  oddsRatio?: string;
  notes: string;
  tags?: string[];

  // From research (optional, populated by research module)
  recentFindings?: ResearchFinding[];
}

export interface ResearchFinding {
  title: string;
  source: string;                  // journal, preprint server
  url: string;
  date: string;
  summary: string;
}

export interface ApoeGenotype {
  rs429358: string;
  rs7412: string;
  diplotype: string;               // e.g. "e3/e3", "e3/e4"
  riskLevel: "low" | "average" | "elevated" | "high";
  explanation: string;
}

export interface PathwayConvergence {
  name: string;
  slug: string;
  variants: MatchedVariant[];
  assessment: string;
  riskLevel: "low" | "moderate" | "elevated" | "high";
  actions: string[];
}

export interface AnalysisResult {
  // Input metadata
  inputFile: string;
  inputFormat: InputFormat;
  buildVersion: string;
  totalSnps: number;
  matchedCount: number;
  analysisDate: string;

  // Core results
  apoe: ApoeGenotype;
  variants: MatchedVariant[];

  // Derived
  pathways: PathwayConvergence[];
  actionItems: ActionItem[];
}

export interface ActionItem {
  priority: "urgent" | "recommended" | "consider" | "informational";
  category: "screening" | "pharmacogenomics" | "lifestyle" | "supplement" | "monitoring";
  title: string;
  detail: string;
  relatedVariants: string[];       // rsids
}

// ─── Report config ──────────────────────────────────────────────

export type ReportFormat = "docx" | "html" | "json" | "markdown";

export interface ReportConfig {
  format: ReportFormat;
  outputPath: string;
  includeSummary: boolean;
  includeRawVariants: boolean;
  includePathways: boolean;
  includeActionItems: boolean;
  includeRecentLiterature: boolean;
  includeMethodology: boolean;
  subjectName?: string;
  language?: string;               // future: i18n
}

// ─── Research provider config ───────────────────────────────────

export type ResearchProvider = "exa" | "pubmed" | "none";

export interface ResearchConfig {
  provider: ResearchProvider;
  apiKey?: string;
  maxResultsPerVariant: number;
  minYear?: number;                // only return papers from this year onward
  enabled: boolean;
}

// ─── Top-level config ───────────────────────────────────────────

export interface GenomicReportConfig {
  input: {
    filePath: string;
    format?: InputFormat;          // auto-detect if not specified
  };
  database: {
    path?: string;                 // custom SNP database JSON; defaults to built-in
    supplementary?: string[];      // additional database files to merge
  };
  research: ResearchConfig;
  report: ReportConfig;
  filters?: {
    minSeverity?: Severity;
    categories?: Category[];
    onlyRiskAlleles?: boolean;
  };
}
