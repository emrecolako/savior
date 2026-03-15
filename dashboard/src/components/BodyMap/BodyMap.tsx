import { useMemo, useState } from "react";
import { BodyMapSvg } from "./BodyMapSvg";
import { organRegions, getCategoriesForOrgan } from "./organMapping";
import { useFilters } from "../../hooks/useFilters";
import { severityColors, severityOrder, categoryLabels } from "../../utils/colors";
import type { MatchedVariant, Category, Severity } from "../../types";

interface BodyMapProps {
  variants: MatchedVariant[];
}

export function BodyMap({ variants }: BodyMapProps) {
  const { state, dispatch } = useFilters();
  const [hoveredOrgan, setHoveredOrgan] = useState<string | null>(null);

  const organData = useMemo(() => {
    const data: Record<string, { count: number; worstSeverity: Severity; categories: Category[] }> = {};
    for (const region of organRegions) {
      const regionVariants = variants.filter((v) => region.categories.includes(v.category));
      if (regionVariants.length === 0) continue;
      let worstSeverity: Severity = "informational";
      for (const v of regionVariants) {
        if (severityOrder.indexOf(v.severity) < severityOrder.indexOf(worstSeverity)) {
          worstSeverity = v.severity;
        }
      }
      data[region.id] = { count: regionVariants.length, worstSeverity, categories: region.categories };
    }
    return data;
  }, [variants]);

  const highlightedOrgans = useMemo(() => {
    const highlights: Record<string, { color: string; intensity: number }> = {};
    for (const [id, d] of Object.entries(organData)) {
      const idx = severityOrder.indexOf(d.worstSeverity);
      highlights[id] = {
        color: severityColors[d.worstSeverity].fill,
        intensity: Math.max(0.3, 1 - idx * 0.12),
      };
    }
    return highlights;
  }, [organData]);

  const handleOrganClick = (organId: string) => {
    if (state.selectedOrgan === organId) {
      dispatch({ type: "SET_ORGAN", payload: null });
      dispatch({ type: "SET_CATEGORIES", payload: [] });
    } else {
      dispatch({ type: "SET_ORGAN", payload: organId });
      dispatch({ type: "SET_CATEGORIES", payload: getCategoriesForOrgan(organId) });
    }
  };

  const hoveredData = hoveredOrgan ? organData[hoveredOrgan] : null;
  const hoveredRegion = hoveredOrgan ? organRegions.find((r) => r.id === hoveredOrgan) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <BodyMapSvg
          highlightedOrgans={highlightedOrgans}
          onOrganClick={handleOrganClick}
          onOrganHover={setHoveredOrgan}
          selectedOrgan={state.selectedOrgan}
        />
        {hoveredData && hoveredRegion && (
          <div className="absolute top-2 right-2 bg-gray-900/95 border border-gray-700 rounded-lg p-3 text-sm min-w-[160px] pointer-events-none">
            <div className="font-semibold text-white mb-1">{hoveredRegion.label}</div>
            <div className="text-gray-400">{hoveredData.count} variant{hoveredData.count !== 1 ? "s" : ""}</div>
            <div className={`text-xs mt-1 ${severityColors[hoveredData.worstSeverity].text}`}>
              Highest: {hoveredData.worstSeverity}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {organRegions
          .filter((r) => organData[r.id])
          .map((r) => (
            <button
              key={r.id}
              onClick={() => handleOrganClick(r.id)}
              className={`px-2 py-1 rounded border transition-colors ${
                state.selectedOrgan === r.id
                  ? "border-white bg-gray-700 text-white"
                  : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500"
              }`}
            >
              {r.label}
              <span className="ml-1 text-gray-500">({organData[r.id].count})</span>
            </button>
          ))}
      </div>
    </div>
  );
}
