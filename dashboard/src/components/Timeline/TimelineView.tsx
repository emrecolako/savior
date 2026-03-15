import { useMemo } from "react";
import { computeRiskCurves } from "./ageRiskModels";
import { RiskCurveChart } from "./RiskCurveChart";
import { AlertTriangle } from "lucide-react";
import type { MatchedVariant } from "../../types";

interface TimelineViewProps {
  variants: MatchedVariant[];
}

export function TimelineView({ variants }: TimelineViewProps) {
  const curves = useMemo(() => computeRiskCurves(variants), [variants]);

  if (curves.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12">
        No age-related risk models match the current variants.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-sm text-amber-300">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          These curves are <strong>illustrative estimates</strong> based on published epidemiological data and your genetic variants.
          They are not clinical predictions. Consult a healthcare provider for personalized risk assessment.
        </span>
      </div>
      <RiskCurveChart curves={curves} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {curves.map((c) => (
          <div key={c.model.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.model.color }} />
              <span className="text-sm font-medium text-gray-200">{c.model.condition}</span>
            </div>
            <div className="text-xs text-gray-400">
              {c.matchedVariantCount} variant{c.matchedVariantCount !== 1 ? "s" : ""} matched
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Risk multiplier: {c.riskMultiplier.toFixed(1)}x baseline
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
