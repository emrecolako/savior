import { createContext, useContext, useReducer, type Dispatch } from "react";
import type { Category, Severity } from "../types";

export interface FilterState {
  categories: Category[];
  severities: Severity[];
  geneSearch: string;
  riskAllelesOnly: boolean;
  selectedPathway: string | null;
  selectedOrgan: string | null;
}

export type FilterAction =
  | { type: "SET_CATEGORIES"; payload: Category[] }
  | { type: "SET_SEVERITIES"; payload: Severity[] }
  | { type: "SET_GENE_SEARCH"; payload: string }
  | { type: "TOGGLE_RISK_ALLELES" }
  | { type: "SET_PATHWAY"; payload: string | null }
  | { type: "SET_ORGAN"; payload: string | null }
  | { type: "RESET" };

export const initialFilterState: FilterState = {
  categories: [],
  severities: [],
  geneSearch: "",
  riskAllelesOnly: false,
  selectedPathway: null,
  selectedOrgan: null,
};

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_CATEGORIES":
      return { ...state, categories: action.payload, selectedOrgan: null };
    case "SET_SEVERITIES":
      return { ...state, severities: action.payload };
    case "SET_GENE_SEARCH":
      return { ...state, geneSearch: action.payload };
    case "TOGGLE_RISK_ALLELES":
      return { ...state, riskAllelesOnly: !state.riskAllelesOnly };
    case "SET_PATHWAY":
      return { ...state, selectedPathway: action.payload, selectedOrgan: null, categories: [] };
    case "SET_ORGAN":
      return { ...state, selectedOrgan: action.payload, selectedPathway: null };
    case "RESET":
      return initialFilterState;
    default:
      return state;
  }
}

export const FilterContext = createContext<{
  state: FilterState;
  dispatch: Dispatch<FilterAction>;
}>({
  state: initialFilterState,
  dispatch: () => {},
});

export function useFilters() {
  return useContext(FilterContext);
}

export function useFilterReducer() {
  return useReducer(filterReducer, initialFilterState);
}
