export interface AgeRiskModel {
  id: string;
  condition: string;
  color: string;
  matchPatterns: RegExp[];
  genePatterns: string[];
  baselineLifetimeRisk: number;
  onsetCurve: [number, number][]; // [age, cumulative_fraction_of_lifetime_risk]
}

export const ageRiskModels: AgeRiskModel[] = [
  {
    id: "alzheimers",
    condition: "Alzheimer's Disease",
    color: "#a855f7",
    matchPatterns: [/alzheimer/i, /dementia/i, /cognitive.*decline/i],
    genePatterns: ["APOE", "CLU", "PICALM", "BIN1", "CR1", "ABCA7", "TREM2"],
    baselineLifetimeRisk: 0.11,
    onsetCurve: [[20, 0], [40, 0], [50, 0.01], [60, 0.03], [65, 0.07], [70, 0.15], [75, 0.30], [80, 0.50], [85, 0.72], [90, 1.0]],
  },
  {
    id: "cad",
    condition: "Coronary Artery Disease",
    color: "#ef4444",
    matchPatterns: [/coronary/i, /myocardial/i, /heart.*attack/i, /atherosclerosis/i, /cad\b/i],
    genePatterns: ["LDLR", "PCSK9", "APOB", "LPA", "CDKN2A", "CDKN2B", "SORT1", "PHACTR1", "MIA3"],
    baselineLifetimeRisk: 0.25,
    onsetCurve: [[20, 0], [30, 0.01], [40, 0.05], [50, 0.15], [55, 0.25], [60, 0.38], [65, 0.52], [70, 0.67], [75, 0.80], [80, 0.90], [85, 0.96], [90, 1.0]],
  },
  {
    id: "t2d",
    condition: "Type 2 Diabetes",
    color: "#f97316",
    matchPatterns: [/type.*2.*diabetes/i, /t2d/i, /insulin.*resistance/i, /metabolic.*syndrome/i],
    genePatterns: ["TCF7L2", "PPARG", "KCNJ11", "SLC30A8", "FTO", "MC4R", "CDKAL1", "IGF2BP2"],
    baselineLifetimeRisk: 0.33,
    onsetCurve: [[20, 0], [25, 0.01], [30, 0.03], [35, 0.07], [40, 0.14], [45, 0.22], [50, 0.33], [55, 0.45], [60, 0.58], [65, 0.70], [70, 0.80], [75, 0.88], [80, 0.94], [85, 0.97], [90, 1.0]],
  },
  {
    id: "amd",
    condition: "Macular Degeneration",
    color: "#06b6d4",
    matchPatterns: [/macular.*degeneration/i, /amd\b/i],
    genePatterns: ["CFH", "ARMS2", "HTRA1", "C3", "CFB", "C2"],
    baselineLifetimeRisk: 0.065,
    onsetCurve: [[20, 0], [40, 0], [50, 0.02], [55, 0.05], [60, 0.10], [65, 0.20], [70, 0.35], [75, 0.55], [80, 0.75], [85, 0.90], [90, 1.0]],
  },
  {
    id: "afib",
    condition: "Atrial Fibrillation",
    color: "#ec4899",
    matchPatterns: [/atrial.*fib/i, /a-?fib/i],
    genePatterns: ["PITX2", "ZFHX3", "KCNN3", "SCN5A", "SCN10A"],
    baselineLifetimeRisk: 0.25,
    onsetCurve: [[20, 0], [40, 0.01], [50, 0.04], [55, 0.08], [60, 0.16], [65, 0.27], [70, 0.42], [75, 0.58], [80, 0.74], [85, 0.88], [90, 1.0]],
  },
  {
    id: "breast_cancer",
    condition: "Breast Cancer",
    color: "#f472b6",
    matchPatterns: [/breast.*cancer/i],
    genePatterns: ["BRCA1", "BRCA2", "CHEK2", "ATM", "PALB2", "RAD51", "TP53"],
    baselineLifetimeRisk: 0.125,
    onsetCurve: [[20, 0], [25, 0.005], [30, 0.02], [35, 0.05], [40, 0.10], [45, 0.18], [50, 0.28], [55, 0.39], [60, 0.50], [65, 0.62], [70, 0.73], [75, 0.83], [80, 0.91], [85, 0.96], [90, 1.0]],
  },
  {
    id: "colorectal",
    condition: "Colorectal Cancer",
    color: "#84cc16",
    matchPatterns: [/colorectal/i, /colon.*cancer/i],
    genePatterns: ["MLH1", "MSH2", "APC", "SMAD7", "BMP4"],
    baselineLifetimeRisk: 0.042,
    onsetCurve: [[20, 0], [30, 0.01], [40, 0.04], [50, 0.14], [55, 0.22], [60, 0.33], [65, 0.46], [70, 0.60], [75, 0.74], [80, 0.86], [85, 0.94], [90, 1.0]],
  },
];

export interface ComputedRiskCurve {
  model: AgeRiskModel;
  points: { age: number; risk: number }[];
  matchedVariantCount: number;
  riskMultiplier: number;
}

export function computeRiskCurves(
  variants: { gene: string; condition: string; severity: string; oddsRatio?: string; riskAlleleCount: number }[]
): ComputedRiskCurve[] {
  return ageRiskModels
    .map((model) => {
      const matched = variants.filter(
        (v) =>
          v.riskAlleleCount > 0 &&
          (model.genePatterns.includes(v.gene) ||
            model.matchPatterns.some((p) => p.test(v.condition)))
      );

      if (matched.length === 0) return null;

      let multiplier = 1.0;
      for (const v of matched) {
        const or = v.oddsRatio ? parseFloat(v.oddsRatio) : null;
        if (or && !isNaN(or) && or > 0) {
          multiplier *= Math.pow(or, v.riskAlleleCount);
        } else {
          const severityMult: Record<string, number> = {
            critical: 2.5,
            high: 1.8,
            moderate: 1.3,
            low: 1.1,
            protective: 0.7,
          };
          multiplier *= severityMult[v.severity] ?? 1.0;
        }
      }

      const points = model.onsetCurve.map(([age, fraction]) => ({
        age,
        risk: Math.min(1, fraction * model.baselineLifetimeRisk * multiplier),
      }));

      return { model, points, matchedVariantCount: matched.length, riskMultiplier: multiplier };
    })
    .filter(Boolean) as ComputedRiskCurve[];
}
