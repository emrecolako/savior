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
  synergyScore: number;        // 0-100 composite score
  compoundEffects: string[];   // gene-gene interaction descriptions
  narrative: string;           // human-readable pathway explanation
  involvedGenes: string[];     // deduplicated gene list
}

export interface PathwayActionTemplate {
  priority: ActionItem["priority"];
  category: ActionItem["category"];
  title: string;
  detail: string;
  minRiskLevel: PathwayConvergence["riskLevel"];
}

export interface PathwayDefinition {
  name: string;
  slug: string;
  description: string;
  genePatterns: string[];
  keywords: string[];
  categories: Category[];
  tags: string[];                                    // match on SNP tags field
  interactionNotes: Record<string, string>;          // "GENE1+GENE2" → explanation
  synergyMultiplier: number;                         // base multiplier when >1 gene hit
  homozygousPenalty: number;                         // extra weight for homozygous
  narrativeTemplate: string;                         // template with {{placeholders}}
  actionTemplates: PathwayActionTemplate[];
}

// ─── Pharmacogenomics ─────────────────────────────────────────

export type MetabolizerPhenotype =
  | "ultra-rapid"
  | "rapid"
  | "normal"
  | "intermediate"
  | "poor"
  | "indeterminate";

export type PgxGene =
  | "CYP2D6"
  | "CYP2C19"
  | "CYP2C9"
  | "CYP3A4"
  | "CYP3A5"
  | "CYP1A2"
  | "DPYD"
  | "TPMT"
  | "SLCO1B1"
  | "UGT1A1"
  | "ABCB1";

export type DrugAction =
  | "use standard dose"
  | "use with caution"
  | "consider dose reduction"
  | "consider dose increase"
  | "use alternative"
  | "avoid"
  | "no actionable variant detected"
  | "see notes";

export interface DrugInteraction {
  drug: string;
  drugClass: string;
  primaryGene: PgxGene;
  action: DrugAction;
  detail: string;
  evidence: string;
}

export interface GeneMetabolizerStatus {
  gene: PgxGene;
  phenotype: MetabolizerPhenotype;
  activityScore: number | null;    // CPIC-style 0-3+ ; null if not applicable
  detectedVariants: string[];      // rsids found in this individual
  diplotype: string;               // e.g. "*1/*2", "normal/normal"
  explanation: string;
}

export interface DrugGeneMatrix {
  genes: GeneMetabolizerStatus[];
  interactions: DrugInteraction[];
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
  pharmacogenomics: DrugGeneMatrix;

  // Polygenic risk scores (optional)
  prs?: PrsResult;
}

export interface ActionItem {
  priority: "urgent" | "recommended" | "consider" | "informational";
  category: "screening" | "pharmacogenomics" | "lifestyle" | "supplement" | "monitoring";
  title: string;
  detail: string;
  relatedVariants: string[];       // rsids
}

// ─── Polygenic risk scores ──────────────────────────────────────

export interface PgsVariantWeight {
  rsid: string;
  effectAllele: string;
  otherAllele: string;
  effectWeight: number;        // beta from GWAS summary statistics
  chr: string;
  pos: number;
}

export interface PopulationParams {
  source: string;              // e.g. "UK Biobank"
  ancestry: string;            // e.g. "EUR", "multi-ancestry"
  mean: number;                // population mean PRS
  sd: number;                  // population standard deviation
  sampleSize: number;
}

export interface PgsScoringFile {
  pgsId: string;               // e.g. "PGS000018"
  traitName: string;           // e.g. "Coronary Artery Disease"
  traitId: string;             // slug: "cad", "t2d", "autoimmune"
  publicationPmid?: string;
  genomeBuild: string;         // "GRCh37" or "GRCh38"
  totalVariantsOriginal: number;
  totalVariantsCurated: number;
  populationParams: PopulationParams;
  variants: PgsVariantWeight[];
}

export type PrsRiskCategory = "low" | "average" | "above-average" | "elevated" | "high";

export interface PrsContributor {
  rsid: string;
  gene?: string;
  effectAllele: string;
  dosage: number;              // 0, 1, or 2
  contribution: number;        // effectWeight × dosage
}

export interface PrsTraitResult {
  traitId: string;
  traitName: string;
  pgsId: string;
  rawScore: number;
  zScore: number;
  percentile: number;          // 0–100
  riskCategory: PrsRiskCategory;
  variantsUsed: number;
  variantsTotal: number;
  coveragePct: number;         // variantsUsed / variantsTotal × 100
  topContributors: PrsContributor[];
  interpretation: string;
}

export interface PrsResult {
  traits: PrsTraitResult[];
  limitations: string[];
}

export interface PrsConfig {
  enabled: boolean;
  traits?: string[];           // specific trait IDs, or all if omitted
  scoringDataPath?: string;    // custom path to PGS scoring data directory
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
  includePrs: boolean;
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
  prs?: PrsConfig;
  report: ReportConfig;
  filters?: {
    minSeverity?: Severity;
    categories?: Category[];
    onlyRiskAlleles?: boolean;
  };
}
