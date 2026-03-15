import { riskLevelColors } from "../../utils/colors";
import type { ApoeGenotype } from "../../types";
import { Dna } from "lucide-react";

interface ApoeCardProps {
  apoe: ApoeGenotype;
}

const riskBorders: Record<string, string> = {
  low: "border-green-600",
  average: "border-gray-600",
  elevated: "border-orange-600",
  high: "border-red-600",
};

export function ApoeCard({ apoe }: ApoeCardProps) {
  return (
    <div className={`bg-gray-800/50 border-2 ${riskBorders[apoe.riskLevel]} rounded-lg p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Dna className="w-5 h-5 text-purple-400" />
        <h3 className="font-semibold text-white">APOE Genotype</h3>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-2xl font-mono font-bold text-white">{apoe.diplotype}</span>
        <span className={`text-sm font-medium uppercase ${riskLevelColors[apoe.riskLevel]}`}>
          {apoe.riskLevel} risk
        </span>
      </div>
      <p className="text-sm text-gray-400 leading-relaxed">{apoe.explanation}</p>
      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span>rs429358: <span className="text-gray-300 font-mono">{apoe.rs429358}</span></span>
        <span>rs7412: <span className="text-gray-300 font-mono">{apoe.rs7412}</span></span>
      </div>
    </div>
  );
}
