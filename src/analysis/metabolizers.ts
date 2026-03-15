import type {
  MatchedVariant,
  ParsedGenome,
  PgxGene,
  MetabolizerPhenotype,
  GeneMetabolizerStatus,
  DrugInteraction,
  DrugGeneMatrix,
  DrugAction,
} from "../types.js";

// ─── Star-allele definitions per gene ────────────────────────
//
// Each entry maps an rsID to its variant allele and star-allele name.
// Activity scores follow CPIC conventions:
//   normal-function allele = 1, decreased = 0.5, no-function = 0,
//   increased-function = 1.5 or 2.

interface StarAllele {
  rsid: string;
  variantAllele: string;        // the non-wildtype allele
  starAllele: string;           // e.g. "*2", "*3"
  activityValue: number;        // per-allele activity
  functionLabel: string;        // "no function", "decreased", "normal", "increased"
}

interface GeneProfile {
  gene: PgxGene;
  normalActivity: number;       // activity score of the *1 (wildtype) allele
  starAlleles: StarAllele[];
  phenotypeThresholds: { min: number; max: number; phenotype: MetabolizerPhenotype }[];
}

// Activity scores are per-allele, so wildtype *1/*1 = normalActivity × 2.
// Thresholds below operate on the TOTAL activity score (sum of both alleles).
// Examples for normalActivity=1:
//   *1/*1 = 2, *1/*decreased(0.5) = 1.5, *1/*null(0) = 1,
//   *decreased/*decreased = 1, *null/*null = 0

const GENE_PROFILES: GeneProfile[] = [
  // ── CYP2D6 ──
  {
    gene: "CYP2D6",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs28399504", variantAllele: "A", starAllele: "*4",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs16947",    variantAllele: "A", starAllele: "*2",  activityValue: 1,   functionLabel: "normal" },
      { rsid: "rs1065852",  variantAllele: "A", starAllele: "*10", activityValue: 0.5, functionLabel: "decreased" },
      { rsid: "rs5030655",  variantAllele: "A", starAllele: "*6",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs3892097",  variantAllele: "A", starAllele: "*4",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs35742686", variantAllele: "T", starAllele: "*3",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs769258",   variantAllele: "A", starAllele: "*4",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs1135840",  variantAllele: "G", starAllele: "*2",  activityValue: 1,   functionLabel: "normal" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.25, phenotype: "poor" },
      { min: 0.26, max: 1.25, phenotype: "intermediate" },
      { min: 1.26, max: 2.25, phenotype: "normal" },
      { min: 2.26, max: 99,   phenotype: "ultra-rapid" },
    ],
  },
  // ── CYP2C19 ──
  {
    gene: "CYP2C19",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs4244285",  variantAllele: "A", starAllele: "*2",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs4986893",  variantAllele: "A", starAllele: "*3",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs12248560", variantAllele: "T", starAllele: "*17", activityValue: 1.5, functionLabel: "increased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.25, phenotype: "poor" },
      { min: 0.26, max: 1.25, phenotype: "intermediate" },
      { min: 1.26, max: 2.25, phenotype: "normal" },
      { min: 2.26, max: 3,    phenotype: "rapid" },
      { min: 3.01, max: 99,   phenotype: "ultra-rapid" },
    ],
  },
  // ── CYP2C9 ──
  {
    gene: "CYP2C9",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs1799853", variantAllele: "T", starAllele: "*2", activityValue: 0.5, functionLabel: "decreased" },
      { rsid: "rs1057910", variantAllele: "C", starAllele: "*3", activityValue: 0,   functionLabel: "no function" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.5,  phenotype: "poor" },
      { min: 0.51, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── CYP3A4 ──
  {
    gene: "CYP3A4",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs2242480", variantAllele: "T", starAllele: "*1G",  activityValue: 1,   functionLabel: "normal" },
      { rsid: "rs4646437", variantAllele: "A", starAllele: "*22",  activityValue: 0.5, functionLabel: "decreased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.75, phenotype: "poor" },
      { min: 0.76, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── CYP3A5 ──
  {
    gene: "CYP3A5",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs776746", variantAllele: "C", starAllele: "*3", activityValue: 0, functionLabel: "no function" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.25, phenotype: "poor" },
      { min: 0.26, max: 1.25, phenotype: "intermediate" },
      { min: 1.26, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── CYP1A2 ──
  {
    gene: "CYP1A2",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs762551", variantAllele: "A", starAllele: "*1F", activityValue: 1.5, functionLabel: "increased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 2.25, phenotype: "normal" },
      { min: 2.26, max: 3,    phenotype: "rapid" },
      { min: 3.01, max: 99,   phenotype: "ultra-rapid" },
    ],
  },
  // ── DPYD ──
  {
    gene: "DPYD",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs3918290",  variantAllele: "A", starAllele: "*2A",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs67376798", variantAllele: "A", starAllele: "D949V", activityValue: 0.5, functionLabel: "decreased" },
      { rsid: "rs55886062", variantAllele: "A", starAllele: "*13",  activityValue: 0,   functionLabel: "no function" },
      { rsid: "rs75017182", variantAllele: "C", starAllele: "c.1129-5923C>G", activityValue: 0.5, functionLabel: "decreased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.5,  phenotype: "poor" },
      { min: 0.51, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── TPMT ──
  {
    gene: "TPMT",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs1800462", variantAllele: "G", starAllele: "*2",  activityValue: 0, functionLabel: "no function" },
      { rsid: "rs1800460", variantAllele: "T", starAllele: "*3B", activityValue: 0, functionLabel: "no function" },
      { rsid: "rs1142345", variantAllele: "C", starAllele: "*3C", activityValue: 0, functionLabel: "no function" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.25, phenotype: "poor" },
      { min: 0.26, max: 1.25, phenotype: "intermediate" },
      { min: 1.26, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── SLCO1B1 ──
  {
    gene: "SLCO1B1",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs4149056", variantAllele: "C", starAllele: "*5", activityValue: 0.5, functionLabel: "decreased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.75, phenotype: "poor" },
      { min: 0.76, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── UGT1A1 ──
  {
    gene: "UGT1A1",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs887829",  variantAllele: "T", starAllele: "*80", activityValue: 0.5, functionLabel: "decreased" },
      { rsid: "rs4148323", variantAllele: "A", starAllele: "*6",  activityValue: 0.5, functionLabel: "decreased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.75, phenotype: "poor" },
      { min: 0.76, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
  // ── ABCB1 ──
  {
    gene: "ABCB1",
    normalActivity: 1,
    starAlleles: [
      { rsid: "rs1045642", variantAllele: "T", starAllele: "3435T", activityValue: 0.5, functionLabel: "decreased" },
      { rsid: "rs2032582", variantAllele: "T", starAllele: "2677T", activityValue: 0.5, functionLabel: "decreased" },
    ],
    phenotypeThresholds: [
      { min: 0,    max: 0.75, phenotype: "poor" },
      { min: 0.76, max: 1.75, phenotype: "intermediate" },
      { min: 1.76, max: 2.25, phenotype: "normal" },
    ],
  },
];

// ─── Star-allele calling ─────────────────────────────────────

function callGeneStatus(
  profile: GeneProfile,
  genome: ParsedGenome,
  variants: MatchedVariant[]
): GeneMetabolizerStatus {
  const detectedVariants: string[] = [];
  let allele1Activity = profile.normalActivity; // default: wildtype
  let allele2Activity = profile.normalActivity;
  const starLabels: string[] = [];

  // For each star-allele SNP, check if it's in the genome
  for (const sa of profile.starAlleles) {
    const snp = genome.snps.get(sa.rsid);
    if (!snp || snp.genotype === "--" || snp.genotype === "00") continue;

    const gt = snp.genotype;
    const varCount = gt.split("").filter((a) => a === sa.variantAllele).length;

    if (varCount === 0) continue;

    detectedVariants.push(sa.rsid);

    if (varCount >= 1) {
      // First variant allele replaces the highest-activity allele slot
      if (allele1Activity >= allele2Activity) {
        allele1Activity = sa.activityValue;
      } else {
        allele2Activity = sa.activityValue;
      }
      starLabels.push(sa.starAllele);
    }
    if (varCount === 2) {
      // Homozygous — both alleles affected
      allele2Activity = sa.activityValue;
      starLabels.push(sa.starAllele);
    }
  }

  const activityScore = allele1Activity + allele2Activity;

  // Determine phenotype from thresholds
  let phenotype: MetabolizerPhenotype = "indeterminate";
  for (const t of profile.phenotypeThresholds) {
    if (activityScore >= t.min && activityScore <= t.max) {
      phenotype = t.phenotype;
      break;
    }
  }

  // Build diplotype string
  const diplotype = starLabels.length > 0
    ? `*1/${starLabels.join("/")}` // simplified — shows detected variant alleles
    : "*1/*1";

  const explanationParts: string[] = [];
  if (phenotype === "poor") {
    explanationParts.push(`Severely reduced ${profile.gene} activity.`);
    explanationParts.push("Drugs metabolised by this enzyme may accumulate to toxic levels or prodrugs may be ineffective.");
  } else if (phenotype === "intermediate") {
    explanationParts.push(`Reduced ${profile.gene} activity.`);
    explanationParts.push("May require dose adjustments for drugs metabolised by this enzyme.");
  } else if (phenotype === "rapid" || phenotype === "ultra-rapid") {
    explanationParts.push(`Increased ${profile.gene} activity.`);
    explanationParts.push("Standard doses may be sub-therapeutic; prodrugs may produce excess active metabolite.");
  } else if (phenotype === "normal") {
    explanationParts.push(`Normal ${profile.gene} activity. Standard dosing expected to be appropriate.`);
  } else {
    explanationParts.push(`${profile.gene} status could not be fully determined from available data.`);
  }

  return {
    gene: profile.gene,
    phenotype,
    activityScore,
    detectedVariants,
    diplotype,
    explanation: explanationParts.join(" "),
  };
}

// ─── Drug-gene interaction definitions ───────────────────────

interface DrugDef {
  drug: string;
  drugClass: string;
  primaryGene: PgxGene;
  evidence: string;
  actions: Partial<Record<MetabolizerPhenotype, { action: DrugAction; detail: string }>>;
}

const DRUG_DEFINITIONS: DrugDef[] = [
  // ── SSRIs ──
  {
    drug: "Citalopram / Escitalopram",
    drugClass: "SSRIs",
    primaryGene: "CYP2C19",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "50% dose reduction recommended. Consider alternative SSRI (sertraline)." },
      "intermediate": { action: "use with caution",        detail: "Consider 50% dose reduction if side effects occur." },
      "ultra-rapid":  { action: "use alternative",          detail: "May have sub-therapeutic levels. Consider sertraline or an SNRI." },
      "rapid":        { action: "use with caution",         detail: "May require higher dose. Monitor therapeutic response closely." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Sertraline",
    drugClass: "SSRIs",
    primaryGene: "CYP2C19",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Consider 50% dose reduction. Lower starting dose." },
      "intermediate": { action: "use standard dose",       detail: "Standard dosing. Monitor for side effects." },
      "ultra-rapid":  { action: "consider dose increase",   detail: "May need higher dose. Consider therapeutic drug monitoring." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Paroxetine",
    drugClass: "SSRIs",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",         detail: "Paroxetine is a CYP2D6 substrate and inhibitor. Use sertraline or citalopram instead." },
      "intermediate": { action: "use with caution",        detail: "Consider lower dose. Monitor for side effects." },
      "ultra-rapid":  { action: "use alternative",         detail: "Likely sub-therapeutic. Choose a non-CYP2D6 substrate." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Fluoxetine",
    drugClass: "SSRIs",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduced clearance. Consider 50% lower starting dose." },
      "intermediate": { action: "use with caution",        detail: "Consider lower dose if side effects emerge." },
      "ultra-rapid":  { action: "use alternative",         detail: "Consider sertraline or citalopram for more predictable levels." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Fluvoxamine",
    drugClass: "SSRIs",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduced clearance expected. Monitor closely." },
      "intermediate": { action: "use standard dose",       detail: "Standard dosing. Be aware of CYP1A2 inhibition." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── SNRIs / Tricyclics ──
  {
    drug: "Venlafaxine / Desvenlafaxine",
    drugClass: "SNRIs",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "use with caution",    detail: "Parent drug accumulates (reduced O-demethylation). Consider desvenlafaxine which bypasses CYP2D6." },
      "intermediate": { action: "use standard dose",   detail: "Standard dose generally appropriate." },
      "ultra-rapid":  { action: "use with caution",    detail: "Rapid conversion to active metabolite. Monitor efficacy." },
      "normal":       { action: "use standard dose",   detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Amitriptyline",
    drugClass: "Tricyclics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "avoid",                detail: "AVOID. High risk of toxicity. Use alternative antidepressant." },
      "intermediate": { action: "consider dose reduction", detail: "Reduce dose by 25%. Monitor TCA plasma levels." },
      "ultra-rapid":  { action: "avoid",                detail: "AVOID. Sub-therapeutic levels expected. Use alternative." },
      "normal":       { action: "use standard dose",    detail: "Standard dosing with therapeutic drug monitoring." },
    },
  },
  {
    drug: "Nortriptyline",
    drugClass: "Tricyclics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "avoid",                detail: "AVOID. High risk of toxicity. Use alternative." },
      "intermediate": { action: "consider dose reduction", detail: "Reduce dose by 25%. Monitor plasma levels." },
      "ultra-rapid":  { action: "avoid",                detail: "AVOID. Sub-therapeutic levels. Use alternative." },
      "normal":       { action: "use standard dose",    detail: "Standard dosing appropriate." },
    },
  },

  // ── Opioids ──
  {
    drug: "Codeine",
    drugClass: "Opioid analgesics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",  detail: "AVOID. Codeine is a prodrug — no conversion to morphine. Use non-codeine analgesic." },
      "intermediate": { action: "use with caution",  detail: "Reduced efficacy likely. Consider alternative analgesic." },
      "ultra-rapid":  { action: "avoid",             detail: "AVOID — LIFE-THREATENING. Rapid conversion to morphine → respiratory depression risk. Use non-codeine analgesic." },
      "normal":       { action: "use standard dose", detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Tramadol",
    drugClass: "Opioid analgesics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",   detail: "Reduced efficacy (prodrug). Use non-tramadol analgesic." },
      "intermediate": { action: "use with caution",  detail: "May have reduced analgesic effect. Monitor pain control." },
      "ultra-rapid":  { action: "avoid",             detail: "AVOID. Risk of respiratory depression. Use non-tramadol analgesic." },
      "normal":       { action: "use standard dose", detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Oxycodone",
    drugClass: "Opioid analgesics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "use with caution",  detail: "Reduced formation of active metabolite. May need dose titration." },
      "ultra-rapid":  { action: "use with caution",  detail: "Enhanced oxymorphone formation. Monitor for excessive sedation." },
      "normal":       { action: "use standard dose", detail: "Standard dosing appropriate." },
    },
  },

  // ── Statins ──
  {
    drug: "Simvastatin",
    drugClass: "Statins",
    primaryGene: "SLCO1B1",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",         detail: "AVOID simvastatin. High myopathy risk. Use rosuvastatin or pravastatin." },
      "intermediate": { action: "consider dose reduction",  detail: "Limit to 20 mg/day max. Consider rosuvastatin or pravastatin." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Atorvastatin",
    drugClass: "Statins",
    primaryGene: "SLCO1B1",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction",  detail: "Increased myopathy risk. Consider lower dose or rosuvastatin." },
      "intermediate": { action: "use with caution",         detail: "Monitor for muscle symptoms. Consider CK levels if symptomatic." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Rosuvastatin",
    drugClass: "Statins",
    primaryGene: "SLCO1B1",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Use lowest effective dose. Preferred over simvastatin in SLCO1B1 poor transporters." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Pravastatin",
    drugClass: "Statins",
    primaryGene: "SLCO1B1",
    evidence: "CPIC Level B",
    actions: {
      "normal":       { action: "use standard dose", detail: "Preferred statin for SLCO1B1 variant carriers — less transporter-dependent." },
      "poor":         { action: "use standard dose", detail: "Preferred statin choice. Less affected by SLCO1B1 variants." },
      "intermediate": { action: "use standard dose", detail: "Preferred statin choice. Less affected by SLCO1B1 variants." },
    },
  },

  // ── NSAIDs ──
  {
    drug: "Celecoxib",
    drugClass: "NSAIDs",
    primaryGene: "CYP2C9",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce starting dose by 50%. Use lowest effective dose for shortest duration." },
      "intermediate": { action: "use with caution",        detail: "Consider lower dose. Monitor for GI and renal side effects." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Ibuprofen",
    drugClass: "NSAIDs",
    primaryGene: "CYP2C9",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose or use shorter duration. Increased GI bleed risk." },
      "intermediate": { action: "use with caution",        detail: "Use lowest effective dose. Monitor for side effects." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Meloxicam",
    drugClass: "NSAIDs",
    primaryGene: "CYP2C9",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose by 50%. Prolonged half-life expected." },
      "intermediate": { action: "use with caution",        detail: "Consider lower dose." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── Anticoagulants ──
  {
    drug: "Warfarin",
    drugClass: "Anticoagulants",
    primaryGene: "CYP2C9",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Significantly lower dose required (30-80% reduction). Use pharmacogenomic dosing algorithm." },
      "intermediate": { action: "consider dose reduction", detail: "Moderate dose reduction required (~20-40%). Frequent INR monitoring." },
      "normal":       { action: "use standard dose",       detail: "Standard warfarin dosing algorithm." },
    },
  },
  {
    drug: "Clopidogrel",
    drugClass: "Antiplatelets",
    primaryGene: "CYP2C19",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",         detail: "AVOID. Prodrug requires CYP2C19 activation. Use prasugrel or ticagrelor." },
      "intermediate": { action: "use alternative",         detail: "Reduced platelet inhibition. Use prasugrel or ticagrelor if no contraindication." },
      "ultra-rapid":  { action: "use standard dose",       detail: "Enhanced activation. Standard dose effective." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── PPIs ──
  {
    drug: "Omeprazole / Lansoprazole",
    drugClass: "Proton pump inhibitors",
    primaryGene: "CYP2C19",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Prolonged exposure. Consider lower dose or less frequent dosing." },
      "ultra-rapid":  { action: "consider dose increase",  detail: "May need higher dose or switch to rabeprazole (less CYP2C19-dependent)." },
      "rapid":        { action: "use with caution",        detail: "May have reduced efficacy. Consider dose increase." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── Beta-blockers ──
  {
    drug: "Metoprolol",
    drugClass: "Beta-blockers",
    primaryGene: "CYP2D6",
    evidence: "DPWG Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose by 50-75% or use alternative beta-blocker (atenolol, bisoprolol)." },
      "intermediate": { action: "use with caution",        detail: "Consider lower starting dose. Titrate based on heart rate and blood pressure." },
      "ultra-rapid":  { action: "consider dose increase",  detail: "May need higher dose. Atenolol/bisoprolol as alternatives (not CYP2D6-dependent)." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Carvedilol",
    drugClass: "Beta-blockers",
    primaryGene: "CYP2D6",
    evidence: "DPWG Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose by 50%. Monitor heart rate and blood pressure closely." },
      "ultra-rapid":  { action: "use with caution",        detail: "May need dose titration upward. Consider atenolol." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Propranolol",
    drugClass: "Beta-blockers",
    primaryGene: "CYP2D6",
    evidence: "DPWG Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Use lowest effective dose. Increased bioavailability expected." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── Antipsychotics ──
  {
    drug: "Haloperidol",
    drugClass: "Antipsychotics",
    primaryGene: "CYP2D6",
    evidence: "DPWG Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose by 50%. Monitor for extrapyramidal side effects." },
      "intermediate": { action: "use with caution",        detail: "Consider lower dose. Monitor closely." },
      "ultra-rapid":  { action: "consider dose increase",  detail: "May need higher dose. Monitor therapeutic response." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Risperidone",
    drugClass: "Antipsychotics",
    primaryGene: "CYP2D6",
    evidence: "DPWG Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce dose by ~50%. Active metabolite formation reduced." },
      "intermediate": { action: "use with caution",        detail: "Consider lower starting dose." },
      "ultra-rapid":  { action: "use with caution",        detail: "Rapid conversion to 9-OH-risperidone. Monitor efficacy." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Aripiprazole",
    drugClass: "Antipsychotics",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Reduce starting dose by 50% (to ~50% of usual dose)." },
      "intermediate": { action: "use standard dose",       detail: "Standard dose. May benefit from monitoring." },
      "ultra-rapid":  { action: "use with caution",        detail: "May have reduced efficacy. Consider alternative or dose increase." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },

  // ── Chemotherapy (DPYD) ──
  {
    drug: "5-Fluorouracil / Capecitabine",
    drugClass: "Fluoropyrimidine chemotherapy",
    primaryGene: "DPYD",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "avoid",                   detail: "AVOID — POTENTIALLY FATAL. Complete DPD deficiency. Use alternative regimen." },
      "intermediate": { action: "consider dose reduction",  detail: "Reduce starting dose by 50%. Dose escalate based on tolerance and therapeutic drug monitoring." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate. Pre-treatment DPD testing recommended." },
    },
  },

  // ── Immunosuppressants ──
  {
    drug: "Azathioprine / 6-Mercaptopurine",
    drugClass: "Thiopurine immunosuppressants",
    primaryGene: "TPMT",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "avoid",                   detail: "AVOID standard dose — FATAL myelosuppression risk. Use 10% of standard dose or alternative." },
      "intermediate": { action: "consider dose reduction",  detail: "Start at 50% dose. Monitor CBC weekly for 8 weeks." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Tacrolimus",
    drugClass: "Calcineurin inhibitors",
    primaryGene: "CYP3A5",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use standard dose",        detail: "CYP3A5 non-expresser (*3/*3). Standard tacrolimus dosing." },
      "intermediate": { action: "consider dose increase",   detail: "Heterozygous expresser. May need 1.5-2x dose. Therapeutic drug monitoring essential." },
      "normal":       { action: "consider dose increase",   detail: "CYP3A5 expresser. May need 1.5-2x dose. Target trough via TDM." },
    },
  },

  // ── Other ──
  {
    drug: "Caffeine",
    drugClass: "Methylxanthines",
    primaryGene: "CYP1A2",
    evidence: "Research evidence",
    actions: {
      "ultra-rapid": { action: "see notes",        detail: "Rapid caffeine clearance. Higher intake generally tolerated. Reduced cardiovascular risk from coffee." },
      "rapid":       { action: "see notes",        detail: "Moderately increased clearance. Standard caffeine intake appropriate." },
      "normal":      { action: "use standard dose", detail: "Normal caffeine metabolism." },
    },
  },
  {
    drug: "Theophylline",
    drugClass: "Methylxanthines",
    primaryGene: "CYP1A2",
    evidence: "DPWG Level B",
    actions: {
      "ultra-rapid": { action: "consider dose increase", detail: "Rapid clearance may require higher dose. Use therapeutic drug monitoring." },
      "normal":      { action: "use standard dose",      detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Irinotecan",
    drugClass: "Topoisomerase inhibitors",
    primaryGene: "UGT1A1",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "consider dose reduction",  detail: "Reduce starting dose by 30%. High risk of severe neutropenia and diarrhoea." },
      "intermediate": { action: "use with caution",         detail: "Standard dose with close monitoring for toxicity." },
      "normal":       { action: "use standard dose",        detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Atomoxetine",
    drugClass: "ADHD medications",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level B",
    actions: {
      "poor":         { action: "consider dose reduction", detail: "Start at lower dose. Titrate slowly — 10-fold higher AUC in poor metabolisers." },
      "intermediate": { action: "use with caution",        detail: "Standard starting dose. Titrate cautiously." },
      "ultra-rapid":  { action: "use with caution",        detail: "May need higher than standard dose." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
  {
    drug: "Tamoxifen",
    drugClass: "Endocrine therapy (oncology)",
    primaryGene: "CYP2D6",
    evidence: "CPIC Level A",
    actions: {
      "poor":         { action: "use alternative",         detail: "Reduced endoxifen formation. Consider aromatase inhibitor (if post-menopausal)." },
      "intermediate": { action: "use with caution",        detail: "Reduced efficacy possible. Consider aromatase inhibitor or increased monitoring." },
      "ultra-rapid":  { action: "use standard dose",       detail: "Enhanced activation. Standard dose effective." },
      "normal":       { action: "use standard dose",       detail: "Standard dosing appropriate." },
    },
  },
];

// ─── Public API ──────────────────────────────────────────────

export function buildDrugGeneMatrix(
  genome: ParsedGenome,
  variants: MatchedVariant[]
): DrugGeneMatrix {
  // 1. Determine metabolizer status for each gene
  const genes: GeneMetabolizerStatus[] = GENE_PROFILES.map((profile) =>
    callGeneStatus(profile, genome, variants)
  );

  const geneMap = new Map(genes.map((g) => [g.gene, g]));

  // 2. Evaluate each drug interaction
  const interactions: DrugInteraction[] = DRUG_DEFINITIONS.map((dd) => {
    const geneStatus = geneMap.get(dd.primaryGene);
    const phenotype = geneStatus?.phenotype ?? "indeterminate";

    const match = dd.actions[phenotype];
    if (match) {
      return {
        drug: dd.drug,
        drugClass: dd.drugClass,
        primaryGene: dd.primaryGene,
        action: match.action,
        detail: match.detail,
        evidence: dd.evidence,
      };
    }

    // Default for phenotypes without explicit entries
    return {
      drug: dd.drug,
      drugClass: dd.drugClass,
      primaryGene: dd.primaryGene,
      action: "no actionable variant detected" as DrugAction,
      detail: `No specific guidance for ${phenotype} ${dd.primaryGene} metaboliser status.`,
      evidence: dd.evidence,
    };
  });

  return { genes, interactions };
}
