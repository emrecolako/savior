import { useFilters } from "../../hooks/useFilters";
import { riskLevelColors } from "../../utils/colors";
import type { PathwayConvergence } from "../../types";
import { TrendingUp } from "lucide-react";

interface PathwayCardsProps {
  pathways: PathwayConvergence[];
}

export function PathwayCards({ pathways }: PathwayCardsProps) {
  const { state, dispatch } = useFilters();

  if (pathways.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Pathway Convergence</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {pathways.map((p) => {
          const isSelected = state.selectedPathway === p.slug;
          const genes = [...new Set(p.variants.map((v) => v.gene))].slice(0, 6);
          return (
            <button
              key={p.slug}
              onClick={() => dispatch({ type: "SET_PATHWAY", payload: isSelected ? null : p.slug })}
              className={`text-left bg-gray-800/50 border rounded-lg p-3 transition-colors ${
                isSelected
                  ? "border-white bg-gray-700/50"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-white">{p.name}</span>
                <span className={`text-xs font-medium uppercase ${riskLevelColors[p.riskLevel]}`}>
                  {p.riskLevel}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-2">
                {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
              </div>
              <div className="flex flex-wrap gap-1">
                {genes.map((g) => (
                  <span key={g} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300 font-mono">
                    {g}
                  </span>
                ))}
                {genes.length < [...new Set(p.variants.map((v) => v.gene))].length && (
                  <span className="px-1.5 py-0.5 text-xs text-gray-500">
                    +{[...new Set(p.variants.map((v) => v.gene))].length - genes.length}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
