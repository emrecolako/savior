import { useFilters } from "../../hooks/useFilters";
import { categoryLabels, severityColors, severityOrder } from "../../utils/colors";
import type { Category, Severity } from "../../types";
import { Filter, X } from "lucide-react";

const allCategories = Object.keys(categoryLabels) as Category[];

export function FilterBar() {
  const { state, dispatch } = useFilters();

  const hasFilters =
    state.categories.length > 0 ||
    state.severities.length > 0 ||
    state.geneSearch !== "" ||
    state.riskAllelesOnly ||
    state.selectedPathway !== null ||
    state.selectedOrgan !== null;

  const toggleCategory = (c: Category) => {
    const next = state.categories.includes(c)
      ? state.categories.filter((x) => x !== c)
      : [...state.categories, c];
    dispatch({ type: "SET_CATEGORIES", payload: next });
  };

  const toggleSeverity = (s: Severity) => {
    const next = state.severities.includes(s)
      ? state.severities.filter((x) => x !== s)
      : [...state.severities, s];
    dispatch({ type: "SET_SEVERITIES", payload: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Filter className="w-4 h-4" />
          Filters
        </div>

        <input
          type="text"
          placeholder="Search gene..."
          value={state.geneSearch}
          onChange={(e) => dispatch({ type: "SET_GENE_SEARCH", payload: e.target.value })}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-500 w-40"
        />

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={state.riskAllelesOnly}
            onChange={() => dispatch({ type: "TOGGLE_RISK_ALLELES" })}
            className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
          />
          Risk alleles only
        </label>

        {state.selectedPathway && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/50 text-purple-300 rounded-full text-xs">
            Pathway: {state.selectedPathway}
            <button onClick={() => dispatch({ type: "SET_PATHWAY", payload: null })}>
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {hasFilters && (
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {severityOrder.map((s) => (
          <button
            key={s}
            onClick={() => toggleSeverity(s)}
            className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
              state.severities.includes(s)
                ? `${severityColors[s].bg} ${severityColors[s].text} ${severityColors[s].border}`
                : "border-gray-700 text-gray-500 hover:border-gray-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {allCategories.map((c) => (
          <button
            key={c}
            onClick={() => toggleCategory(c)}
            className={`px-2 py-1 rounded text-xs transition-colors ${
              state.categories.includes(c)
                ? "bg-gray-600 text-white"
                : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
            }`}
          >
            {categoryLabels[c]}
          </button>
        ))}
      </div>
    </div>
  );
}
