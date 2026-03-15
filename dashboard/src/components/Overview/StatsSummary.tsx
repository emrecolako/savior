import { useMemo } from "react";
import { severityColors, severityOrder } from "../../utils/colors";
import type { MatchedVariant, Severity } from "../../types";

interface StatsSummaryProps {
  variants: MatchedVariant[];
  totalSnps: number;
}

export function StatsSummary({ variants, totalSnps }: StatsSummaryProps) {
  const counts = useMemo(() => {
    const map: Record<Severity, number> = {} as any;
    for (const s of severityOrder) map[s] = 0;
    for (const v of variants) map[v.severity]++;
    return map;
  }, [variants]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="text-3xl font-bold text-white">{totalSnps.toLocaleString()}</div>
        <div className="text-sm text-gray-400 mt-1">Total SNPs analyzed</div>
      </div>
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="text-3xl font-bold text-white">{variants.length}</div>
        <div className="text-sm text-gray-400 mt-1">Clinical matches</div>
      </div>
      <div className="col-span-2 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="text-sm text-gray-400 mb-2">By severity</div>
        <div className="flex flex-wrap gap-2">
          {severityOrder.map((s) =>
            counts[s] > 0 ? (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${severityColors[s].bg} ${severityColors[s].text}`}
              >
                <span className={`w-2 h-2 rounded-full ${severityColors[s].dot}`} />
                {s} ({counts[s]})
              </span>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}
