import type { Category } from "../../types";

export interface OrganRegion {
  id: string;
  label: string;
  categories: Category[];
}

export const organRegions: OrganRegion[] = [
  { id: "brain", label: "Brain", categories: ["neurological", "psychiatric"] },
  { id: "eyes", label: "Eyes", categories: ["ophthalmological"] },
  { id: "lungs", label: "Lungs", categories: ["pulmonary"] },
  { id: "heart", label: "Heart", categories: ["cardiovascular"] },
  { id: "liver", label: "Liver", categories: ["hepatic", "pharmacogenomics"] },
  { id: "stomach", label: "Digestive", categories: ["nutrigenomic"] },
  { id: "pancreas", label: "Pancreas", categories: ["metabolic"] },
  { id: "kidneys", label: "Kidneys", categories: ["renal"] },
  { id: "blood", label: "Blood", categories: ["hematological"] },
  { id: "immune", label: "Immune", categories: ["autoimmune"] },
  { id: "bones", label: "Musculoskeletal", categories: ["musculoskeletal"] },
  { id: "skin", label: "Skin", categories: ["dermatological"] },
  { id: "reproductive", label: "Reproductive", categories: ["reproductive"] },
  { id: "dna", label: "Oncology", categories: ["oncology"] },
];

export function getOrganForCategory(category: Category): OrganRegion | undefined {
  return organRegions.find((r) => r.categories.includes(category));
}

export function getCategoriesForOrgan(organId: string): Category[] {
  return organRegions.find((r) => r.id === organId)?.categories ?? [];
}
