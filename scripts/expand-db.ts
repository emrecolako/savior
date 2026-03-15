/**
 * Expand the SNP database by fetching clinically significant variants
 * from ClinVar (NCBI E-utilities) and Open Targets Platform (GraphQL API).
 *
 * Usage: npx tsx scripts/expand-db.ts [--dry-run] [--limit 1500]
 *
 * Both APIs are public and require no API key.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SnpEntry, SnpDatabase, Category, Severity } from "../src/types.js";

// ─── Config ───────────────────────────────────────────────────────

const DB_PATH = resolve("data/snp-database.json");
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_FLAG = process.argv.indexOf("--limit");
const TARGET_LIMIT = LIMIT_FLAG !== -1 ? Number(process.argv[LIMIT_FLAG + 1]) : 1500;

const CLINVAR_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql";

// Rate-limit helper — NCBI asks for max 3 req/s without API key
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Category & severity mapping ──────────────────────────────────

const DISEASE_CATEGORY_MAP: Record<string, Category> = {
  cardiovascular: "cardiovascular",
  cardiomyopathy: "cardiovascular",
  arrhythmia: "cardiovascular",
  "long qt": "cardiovascular",
  brugada: "cardiovascular",
  marfan: "cardiovascular",
  "familial hypercholesterolemia": "cardiovascular",
  "coronary artery": "cardiovascular",
  "atrial fibrillation": "cardiovascular",
  aortic: "cardiovascular",
  hypertension: "cardiovascular",
  thrombophilia: "hematological",
  "factor v": "hematological",
  hemophilia: "hematological",
  "sickle cell": "hematological",
  thalassemia: "hematological",
  "von willebrand": "hematological",
  hemochromatosis: "hematological",
  anemia: "hematological",
  diabetes: "metabolic",
  obesity: "metabolic",
  gaucher: "metabolic",
  fabry: "metabolic",
  phenylketonuria: "metabolic",
  "maple syrup": "metabolic",
  galactosemia: "metabolic",
  glycogen: "metabolic",
  hyperlipidemia: "metabolic",
  "breast cancer": "oncology",
  "colorectal cancer": "oncology",
  "lynch syndrome": "oncology",
  melanoma: "oncology",
  "prostate cancer": "oncology",
  "lung cancer": "oncology",
  "ovarian cancer": "oncology",
  "pancreatic cancer": "oncology",
  "endometrial cancer": "oncology",
  glioma: "oncology",
  leukemia: "oncology",
  lymphoma: "oncology",
  retinoblastoma: "oncology",
  "li-fraumeni": "oncology",
  neoplasm: "oncology",
  tumor: "oncology",
  cancer: "oncology",
  alzheimer: "neurological",
  parkinson: "neurological",
  epilepsy: "neurological",
  huntington: "neurological",
  "amyotrophic lateral": "neurological",
  "charcot-marie": "neurological",
  "spinal muscular": "neurological",
  neuropathy: "neurological",
  ataxia: "neurological",
  dystonia: "neurological",
  migraine: "neurological",
  "multiple sclerosis": "autoimmune",
  "rheumatoid arthritis": "autoimmune",
  lupus: "autoimmune",
  celiac: "autoimmune",
  crohn: "autoimmune",
  psoriasis: "autoimmune",
  "type 1 diabetes": "autoimmune",
  "inflammatory bowel": "autoimmune",
  "ankylosing spondylitis": "autoimmune",
  sjogren: "autoimmune",
  asthma: "pulmonary",
  "cystic fibrosis": "pulmonary",
  pulmonary: "pulmonary",
  copd: "pulmonary",
  "macular degeneration": "ophthalmological",
  glaucoma: "ophthalmological",
  "retinitis pigmentosa": "ophthalmological",
  stargardt: "ophthalmological",
  leber: "ophthalmological",
  "polycystic kidney": "renal",
  alport: "renal",
  nephropathy: "renal",
  "wilson disease": "hepatic",
  "alpha-1 antitrypsin": "hepatic",
  cirrhosis: "hepatic",
  hepatitis: "hepatic",
  "ehlers-danlos": "musculoskeletal",
  "osteogenesis imperfecta": "musculoskeletal",
  osteoporosis: "musculoskeletal",
  osteoarthritis: "musculoskeletal",
  dystrophy: "musculoskeletal",
  "epidermolysis bullosa": "dermatological",
  eczema: "dermatological",
  vitiligo: "dermatological",
  albinism: "dermatological",
  schizophrenia: "psychiatric",
  bipolar: "psychiatric",
  autism: "psychiatric",
  depression: "psychiatric",
  adhd: "psychiatric",
  anxiety: "psychiatric",
  warfarin: "pharmacogenomics",
  clopidogrel: "pharmacogenomics",
  statin: "pharmacogenomics",
  codeine: "pharmacogenomics",
  tamoxifen: "pharmacogenomics",
  "drug response": "pharmacogenomics",
  "drug metabolism": "pharmacogenomics",
  cyp2: "pharmacogenomics",
  cyp3: "pharmacogenomics",
  lactose: "nutrigenomic",
  caffeine: "nutrigenomic",
  "vitamin d": "nutrigenomic",
  folate: "nutrigenomic",
  fetal: "reproductive",
  infertility: "reproductive",
  miscarriage: "reproductive",
  preeclampsia: "reproductive",
  "tay-sachs": "carrier",
};

function categorizeCondition(condition: string): Category {
  const lower = condition.toLowerCase();
  for (const [keyword, cat] of Object.entries(DISEASE_CATEGORY_MAP)) {
    if (lower.includes(keyword)) return cat;
  }
  return "other";
}

function classifySeverity(clinSig: string, reviewStatus: string): Severity {
  const sig = clinSig.toLowerCase();
  if (sig.includes("pathogenic") && !sig.includes("likely") && !sig.includes("benign")) {
    if (reviewStatus.includes("expert") || reviewStatus.includes("practice guideline")) return "critical";
    return "high";
  }
  if (sig.includes("likely pathogenic")) return "high";
  if (sig.includes("risk factor")) return "moderate";
  if (sig.includes("drug response")) return "moderate";
  if (sig.includes("protective")) return "protective";
  if (sig.includes("association")) return "moderate";
  if (sig.includes("likely benign") || sig.includes("benign")) return "informational";
  return "low";
}

function mapReviewToEvidence(reviewStatus: string): string {
  if (reviewStatus.includes("practice guideline")) return "ClinVar: practice guideline";
  if (reviewStatus.includes("expert panel")) return "ClinVar: expert panel reviewed";
  if (reviewStatus.includes("multiple submitters")) return "ClinVar: multiple submitters, no conflicts";
  if (reviewStatus.includes("single submitter")) return "ClinVar: single submitter";
  return `ClinVar: ${reviewStatus}`;
}

// ─── ClinVar fetcher ──────────────────────────────────────────────

interface ClinVarResult {
  rsid: string;
  gene: string;
  condition: string;
  clinicalSignificance: string;
  reviewStatus: string;
  riskAllele: string;
}

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`    ⚠️  Fetch failed (attempt ${attempt}/${retries}), retrying in ${attempt * 2}s...`);
      await sleep(attempt * 2000);
    }
  }
  throw new Error("unreachable");
}

async function searchClinVar(query: string, retmax: number): Promise<string[]> {
  const url = `${CLINVAR_BASE}/esearch.fcgi?db=clinvar&term=${encodeURIComponent(query)}&retmax=${retmax}&retmode=json`;
  const res = await fetchWithRetry(url);
  const data = (await res.json()) as any;
  return data.esearchresult?.idlist ?? [];
}

async function fetchClinVarSummaries(ids: string[]): Promise<ClinVarResult[]> {
  const results: ClinVarResult[] = [];
  // Fetch in batches of 100
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const url = `${CLINVAR_BASE}/esummary.fcgi?db=clinvar&id=${batch.join(",")}&retmode=json`;
    const res = await fetchWithRetry(url);
    const data = (await res.json()) as any;
    const docSums = data.result ?? {};

    for (const id of batch) {
      const doc = docSums[id];
      if (!doc) continue;

      // Extract variation set for rsid
      const varSet = doc.variation_set?.[0];
      if (!varSet) continue;

      // Get dbSNP rsid from variation_xrefs
      const dbsnpIds = varSet.variation_xrefs?.filter((x: any) => x.db_source === "dbSNP") ?? [];
      if (dbsnpIds.length === 0) continue;
      const rsid = `rs${dbsnpIds[0].db_id}`;

      // Get gene(s) — genes are at doc level, not inside variation_set
      const genes = doc.genes?.map((g: any) => g.symbol).filter(Boolean) ?? [];
      if (genes.length === 0) continue;

      // Clinical significance — now under germline_classification
      const classification = doc.germline_classification ?? doc.clinical_significance ?? {};
      const clinSig = classification.description ?? "";
      const reviewStatus = classification.review_status ?? "";

      // Condition/trait — now under germline_classification.trait_set
      const traitSet = classification.trait_set ?? doc.trait_set ?? [];
      const traits = traitSet.map((t: any) => t.trait_name).filter(Boolean);
      const condition = traits.join("; ") || doc.title || "";

      // Risk allele from variant name (e.g. "c.3846G>A" → extract the alt allele)
      const varName = varSet.variation_name ?? "";
      const alleleMatch = varName.match(/([ACGT])>([ACGT])/);
      const riskAllele =
        varSet.variant_type === "single nucleotide variant" && alleleMatch
          ? alleleMatch[2]
          : "varies";

      results.push({
        rsid,
        gene: genes[0],
        condition,
        clinicalSignificance: clinSig,
        reviewStatus,
        riskAllele,
      });
    }

    if (i + 100 < ids.length) {
      console.log(`    Fetched ${Math.min(i + 100, ids.length)}/${ids.length} summaries...`);
    }
    await sleep(400); // Rate limit
  }
  return results;
}

async function expandFromClinVar(existingRsids: Set<string>): Promise<SnpEntry[]> {
  console.log("📡 Fetching from ClinVar...");

  const queries = [
    // Pathogenic variants with strong review
    '"pathogenic"[clinical_significance] AND "practice guideline"[review_status]',
    '"pathogenic"[clinical_significance] AND "reviewed by expert panel"[review_status]',
    // Pathogenic with multiple submitters
    '"pathogenic"[clinical_significance] AND "criteria provided, multiple submitters, no conflicts"[review_status]',
    // Likely pathogenic with good evidence
    '"likely pathogenic"[clinical_significance] AND "criteria provided, multiple submitters, no conflicts"[review_status]',
    // Drug response
    '"drug response"[clinical_significance]',
    // Risk factor
    '"risk factor"[clinical_significance] AND "criteria provided, multiple submitters, no conflicts"[review_status]',
    // Protective
    '"protective"[clinical_significance]',
  ];

  const allIds = new Set<string>();
  for (const query of queries) {
    console.log(`  Searching: ${query.slice(0, 70)}...`);
    const ids = await searchClinVar(query, 500);
    console.log(`    → ${ids.length} results`);
    for (const id of ids) allIds.add(id);
    await sleep(400);
  }

  console.log(`  Found ${allIds.size} unique ClinVar records, fetching summaries...`);
  const summaries = await fetchClinVarSummaries([...allIds]);
  console.log(`  Parsed ${summaries.length} summaries with valid rsids`);

  // Filter & convert
  const entries: SnpEntry[] = [];
  const seenRsids = new Set<string>();
  for (const s of summaries) {
    if (existingRsids.has(s.rsid) || seenRsids.has(s.rsid)) continue;
    if (!s.condition || s.condition.length < 3) continue;

    const severity = classifySeverity(s.clinicalSignificance, s.reviewStatus);
    // Skip informational/benign for expansion — focus on actionable variants
    if (severity === "informational") continue;

    seenRsids.add(s.rsid);
    entries.push({
      rsid: s.rsid,
      gene: s.gene,
      riskAllele: s.riskAllele,
      condition: s.condition,
      category: categorizeCondition(s.condition),
      severity,
      evidenceLevel: mapReviewToEvidence(s.reviewStatus),
      notes: `${s.clinicalSignificance}. Auto-imported from ClinVar.`,
      sources: [`https://www.ncbi.nlm.nih.gov/clinvar/?term=${s.rsid}`],
      tags: ["auto-clinvar"],
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
  }

  console.log(`  ✅ ${entries.length} new entries from ClinVar`);
  return entries;
}

// ─── Open Targets Platform fetcher ────────────────────────────────

interface OtGeneDisease {
  geneSymbol: string;
  ensemblId: string;
  diseaseName: string;
  efoId: string;
  score: number;
}

async function fetchOtAssociations(): Promise<OtGeneDisease[]> {
  console.log("📡 Fetching from Open Targets Platform...");

  const diseaseQueries = [
    { efoId: "EFO_0000270", label: "asthma" },
    { efoId: "EFO_0001645", label: "coronary artery disease" },
    { efoId: "EFO_0000685", label: "rheumatoid arthritis" },
    { efoId: "EFO_0000692", label: "schizophrenia" },
    { efoId: "EFO_0001360", label: "type 2 diabetes" },
    { efoId: "EFO_0000384", label: "Crohn's disease" },
    { efoId: "EFO_0003885", label: "multiple sclerosis" },
    { efoId: "EFO_0000305", label: "breast cancer" },
    { efoId: "EFO_0001663", label: "prostate cancer" },
    { efoId: "EFO_0000389", label: "colorectal cancer" },
    { efoId: "EFO_0000249", label: "Alzheimer's disease" },
    { efoId: "EFO_0003761", label: "Parkinson's disease" },
    { efoId: "EFO_0000537", label: "hyperlipidemia" },
    { efoId: "EFO_0000662", label: "psoriasis" },
    { efoId: "EFO_0001359", label: "type 1 diabetes" },
    { efoId: "EFO_0000764", label: "atrial fibrillation" },
    { efoId: "EFO_0004340", label: "macular degeneration" },
    { efoId: "EFO_0000574", label: "lung cancer" },
    { efoId: "EFO_0000275", label: "celiac disease" },
    { efoId: "EFO_0003060", label: "osteoarthritis" },
    { efoId: "EFO_0000341", label: "melanoma" },
    { efoId: "EFO_0004911", label: "glaucoma" },
    { efoId: "EFO_0003144", label: "obesity" },
    { efoId: "EFO_0000228", label: "ankylosing spondylitis" },
    { efoId: "EFO_0000478", label: "gout" },
    { efoId: "EFO_0000289", label: "bipolar disorder" },
    { efoId: "EFO_0003767", label: "inflammatory bowel disease" },
    { efoId: "EFO_0000612", label: "myocardial infarction" },
    { efoId: "EFO_0000182", label: "hepatitis B" },
    { efoId: "EFO_0003932", label: "primary biliary cholangitis" },
  ];

  const results: OtGeneDisease[] = [];

  for (const { efoId, label } of diseaseQueries) {
    const query = `{
      disease(efoId: "${efoId}") {
        associatedTargets(page: { index: 0, size: 30 }) {
          rows {
            target { id approvedSymbol }
            score
          }
        }
      }
    }`;

    try {
      const res = await fetch(OT_GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        console.warn(`  ⚠️  OT query failed for ${label}: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as any;
      const rows = data?.data?.disease?.associatedTargets?.rows ?? [];

      for (const row of rows) {
        results.push({
          geneSymbol: row.target.approvedSymbol,
          ensemblId: row.target.id,
          diseaseName: label,
          efoId,
          score: row.score,
        });
      }
      console.log(`  ${label}: ${rows.length} gene associations`);
    } catch (err) {
      console.warn(`  ⚠️  OT error for ${label}: ${(err as Error).message}`);
    }

    await sleep(150);
  }

  console.log(`  Total gene-disease pairs: ${results.length}`);
  return results;
}

// Look up ClinVar variants for genes found in Open Targets
async function expandFromOpenTargets(
  existingRsids: Set<string>,
  otAssociations: OtGeneDisease[],
): Promise<SnpEntry[]> {
  // Deduplicate genes, keep highest-scoring disease per gene
  const geneMap = new Map<string, OtGeneDisease>();
  for (const a of otAssociations) {
    const existing = geneMap.get(a.geneSymbol);
    if (!existing || a.score > existing.score) {
      geneMap.set(a.geneSymbol, a);
    }
  }

  // Filter to genes not already well-represented in our DB
  const db: SnpDatabase = JSON.parse(readFileSync(DB_PATH, "utf-8"));
  const existingGenes = new Set(db.entries.map((e) => e.gene));
  const newGenes = [...geneMap.entries()].filter(([gene]) => !existingGenes.has(gene));

  console.log(`\n📡 Looking up ClinVar variants for ${newGenes.length} new genes from Open Targets...`);

  const entries: SnpEntry[] = [];
  const seenRsids = new Set<string>();

  // Process genes in batches
  for (let i = 0; i < newGenes.length; i += 5) {
    const batch = newGenes.slice(i, i + 5);

    for (const [gene, assoc] of batch) {
      // Search ClinVar for pathogenic/likely pathogenic variants in this gene
      const query = `"${gene}"[gene] AND ("pathogenic"[clinical_significance] OR "likely pathogenic"[clinical_significance] OR "risk factor"[clinical_significance] OR "drug response"[clinical_significance])`;
      let ids: string[];
      try {
        ids = await searchClinVar(query, 20);
      } catch {
        continue;
      }
      if (ids.length === 0) continue;

      let summaries: ClinVarResult[];
      try {
        summaries = await fetchClinVarSummaries(ids);
      } catch {
        continue;
      }
      for (const s of summaries) {
        if (existingRsids.has(s.rsid) || seenRsids.has(s.rsid)) continue;
        if (!s.condition || s.condition.length < 3) continue;

        const severity = classifySeverity(s.clinicalSignificance, s.reviewStatus);
        if (severity === "informational") continue;

        seenRsids.add(s.rsid);
        existingRsids.add(s.rsid);

        entries.push({
          rsid: s.rsid,
          gene: s.gene,
          riskAllele: s.riskAllele,
          condition: `${s.condition} (${assoc.diseaseName})`,
          category: categorizeCondition(s.condition + " " + assoc.diseaseName),
          severity,
          evidenceLevel: `${mapReviewToEvidence(s.reviewStatus)} + OT score ${assoc.score.toFixed(2)}`,
          notes: `${s.clinicalSignificance}. Gene identified via Open Targets (${assoc.diseaseName}, score ${assoc.score.toFixed(2)}). Auto-imported.`,
          sources: [
            `https://www.ncbi.nlm.nih.gov/clinvar/?term=${s.rsid}`,
            `https://platform.opentargets.org/target/${assoc.ensemblId}/associations`,
          ],
          tags: ["auto-opentargets", "auto-clinvar"],
          lastUpdated: new Date().toISOString().slice(0, 10),
        });
      }
      await sleep(800);
    }

    // Extra pause between batches to avoid NCBI throttling
    await sleep(1500);
    console.log(`  Processed ${Math.min(i + 5, newGenes.length)}/${newGenes.length} genes (${entries.length} new variants)`);
  }

  console.log(`  ✅ ${entries.length} new entries from Open Targets + ClinVar`);
  return entries;
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const db: SnpDatabase = JSON.parse(readFileSync(DB_PATH, "utf-8"));
  const existingRsids = new Set(db.entries.map((e) => e.rsid));
  console.log(`\n🧬 Current database: ${db.entries.length} entries\n`);

  // Phase 1: Direct ClinVar expansion (skip if already done)
  let clinvarEntries: SnpEntry[] = [];
  if (db.entries.length <= 250) {
    clinvarEntries = await expandFromClinVar(existingRsids);
    for (const e of clinvarEntries) existingRsids.add(e.rsid);

    // Save ClinVar results immediately in case phase 2 crashes
    if (!DRY_RUN && clinvarEntries.length > 0) {
      const tempDb: SnpDatabase = JSON.parse(readFileSync(DB_PATH, "utf-8"));
      const sevOrder: Record<string, number> = {
        critical: 0, high: 1, moderate: 2, low: 3, protective: 4, carrier: 5, informational: 6,
      };
      const sorted = [...clinvarEntries].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
      const slots = Math.max(0, TARGET_LIMIT - tempDb.entries.length);
      tempDb.entries.push(...sorted.slice(0, slots));
      tempDb.lastUpdated = new Date().toISOString().slice(0, 10);
      tempDb.version = "0.2.0";
      writeFileSync(DB_PATH, JSON.stringify(tempDb, null, 2) + "\n");
      console.log(`  💾 Saved ${tempDb.entries.length} entries (ClinVar checkpoint)\n`);
    }
  } else {
    console.log(`  ⏩ Skipping ClinVar phase 1 (already at ${db.entries.length} entries)\n`);
  }

  // Phase 2: Open Targets gene discovery → ClinVar variant lookup
  const otAssociations = await fetchOtAssociations();
  const otEntries = await expandFromOpenTargets(existingRsids, otAssociations);

  // Merge — ClinVar-direct entries take priority (stronger clinical evidence)
  const newEntries = [...clinvarEntries, ...otEntries];

  // Sort new entries by severity (most clinically important first)
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 3,
    protective: 4,
    carrier: 5,
    informational: 6,
  };
  newEntries.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Apply target limit
  const remainingSlots = Math.max(0, TARGET_LIMIT - db.entries.length);
  const toAdd = newEntries.slice(0, remainingSlots);

  console.log(`\n📊 Summary:`);
  console.log(`  Original entries:    ${db.entries.length}`);
  console.log(`  ClinVar new:         ${clinvarEntries.length}`);
  console.log(`  Open Targets new:    ${otEntries.length}`);
  console.log(`  Adding (capped):     ${toAdd.length}`);
  console.log(`  New total:           ${db.entries.length + toAdd.length}`);

  if (DRY_RUN) {
    console.log("\n🏃 Dry run — not writing to disk\n");
    for (const e of toAdd.slice(0, 20)) {
      console.log(`  ${e.rsid.padEnd(14)} ${e.gene.padEnd(12)} ${e.severity.padEnd(12)} ${e.category.padEnd(18)} ${e.condition.slice(0, 50)}`);
    }
    if (toAdd.length > 20) console.log(`  ... and ${toAdd.length - 20} more`);
    return;
  }

  // Write expanded database
  db.entries.push(...toAdd);
  db.lastUpdated = new Date().toISOString().slice(0, 10);
  db.version = "0.2.0";

  writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n");
  console.log(`\n✅ Written ${db.entries.length} entries to ${DB_PATH}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
