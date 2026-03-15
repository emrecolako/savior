import type { Severity, Category } from "../types";

export const severityColors: Record<Severity, { bg: string; text: string; border: string; dot: string; fill: string }> = {
  critical: { bg: "bg-red-950", text: "text-red-400", border: "border-red-500", dot: "bg-red-500", fill: "#ef4444" },
  high: { bg: "bg-orange-950", text: "text-orange-400", border: "border-orange-500", dot: "bg-orange-500", fill: "#f97316" },
  moderate: { bg: "bg-yellow-950", text: "text-yellow-400", border: "border-yellow-500", dot: "bg-yellow-500", fill: "#eab308" },
  low: { bg: "bg-blue-950", text: "text-blue-400", border: "border-blue-500", dot: "bg-blue-500", fill: "#3b82f6" },
  protective: { bg: "bg-green-950", text: "text-green-400", border: "border-green-500", dot: "bg-green-500", fill: "#22c55e" },
  carrier: { bg: "bg-amber-950", text: "text-amber-400", border: "border-amber-600", dot: "bg-amber-600", fill: "#d97706" },
  informational: { bg: "bg-gray-800", text: "text-gray-400", border: "border-gray-600", dot: "bg-gray-500", fill: "#6b7280" },
};

export const severityOrder: Severity[] = [
  "critical", "high", "moderate", "low", "protective", "carrier", "informational",
];

export const categoryLabels: Record<Category, string> = {
  pharmacogenomics: "Pharmacogenomics",
  cardiovascular: "Cardiovascular",
  metabolic: "Metabolic",
  neurological: "Neurological",
  autoimmune: "Autoimmune",
  oncology: "Oncology",
  nutrigenomic: "Nutrigenomic",
  carrier: "Carrier",
  ophthalmological: "Ophthalmological",
  hepatic: "Hepatic",
  renal: "Renal",
  pulmonary: "Pulmonary",
  musculoskeletal: "Musculoskeletal",
  hematological: "Hematological",
  dermatological: "Dermatological",
  psychiatric: "Psychiatric",
  reproductive: "Reproductive",
  longevity: "Longevity",
  trait: "Trait",
  other: "Other",
};

export const priorityColors: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-900/50", text: "text-red-300" },
  recommended: { bg: "bg-orange-900/50", text: "text-orange-300" },
  consider: { bg: "bg-blue-900/50", text: "text-blue-300" },
  informational: { bg: "bg-gray-800/50", text: "text-gray-300" },
};

export const riskLevelColors: Record<string, string> = {
  low: "text-green-400",
  average: "text-gray-400",
  moderate: "text-yellow-400",
  elevated: "text-orange-400",
  high: "text-red-400",
};
