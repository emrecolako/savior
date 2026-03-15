export type Severity =
  | "critical"
  | "high"
  | "moderate"
  | "low"
  | "protective"
  | "carrier"
  | "informational";

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

export type Zygosity =
  | "homozygous"
  | "heterozygous"
  | "hemizygous"
  | "unknown";

export interface MatchedVariant {
  rsid: string;
  chromosome: string;
  position: number;
  genotype: string;
  zygosity: Zygosity;
  gene: string;
  riskAllele: string;
  riskAlleleCount: number;
  condition: string;
  category: Category;
  severity: Severity;
  evidenceLevel: string;
  oddsRatio?: string;
  notes: string;
  tags?: string[];
  recentFindings?: ResearchFinding[];
}

export interface ResearchFinding {
  title: string;
  source: string;
  url: string;
  date: string;
  summary: string;
}

export interface ApoeGenotype {
  rs429358: string;
  rs7412: string;
  diplotype: string;
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

export interface ActionItem {
  priority: "urgent" | "recommended" | "consider" | "informational";
  category:
    | "screening"
    | "pharmacogenomics"
    | "lifestyle"
    | "supplement"
    | "monitoring";
  title: string;
  detail: string;
  relatedVariants: string[];
}

export interface ReportMeta {
  tool: string;
  version: string;
  generatedAt: string;
  inputFile: string;
  inputFormat: string;
  buildVersion: string;
  totalSnps: number;
  matchedCount: number;
}

export interface DashboardReport {
  meta: ReportMeta;
  apoe: ApoeGenotype;
  variants: MatchedVariant[];
  pathways: PathwayConvergence[];
  actionItems: ActionItem[];
}
