import React, { useMemo, useState } from "react";
import { useFilters } from "../../hooks/useFilters";
import { severityColors, severityOrder, categoryLabels } from "../../utils/colors";
import { VariantDetail } from "./VariantDetail";
import { FilterBar } from "./FilterBar";
import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import type { MatchedVariant, Severity } from "../../types";

interface VariantTableProps {
  variants: MatchedVariant[];
  pathwaySlugs?: Map<string, string[]>; // slug -> rsid[]
}

type SortKey = "severity" | "gene" | "category" | "rsid" | "riskAlleleCount";
type SortDir = "asc" | "desc";

export function VariantTable({ variants, pathwaySlugs }: VariantTableProps) {
  const { state } = useFilters();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    let list = variants;

    if (state.selectedPathway && pathwaySlugs) {
      const rsids = pathwaySlugs.get(state.selectedPathway);
      if (rsids) list = list.filter((v) => rsids.includes(v.rsid));
    }

    if (state.categories.length > 0) {
      list = list.filter((v) => state.categories.includes(v.category));
    }
    if (state.severities.length > 0) {
      list = list.filter((v) => state.severities.includes(v.severity));
    }
    if (state.geneSearch) {
      const q = state.geneSearch.toLowerCase();
      list = list.filter((v) => v.gene.toLowerCase().includes(q) || v.rsid.toLowerCase().includes(q));
    }
    if (state.riskAllelesOnly) {
      list = list.filter((v) => v.riskAlleleCount > 0);
    }

    return list;
  }, [variants, state, pathwaySlugs]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "severity":
          cmp = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
          break;
        case "gene":
          cmp = a.gene.localeCompare(b.gene);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "rsid":
          cmp = a.rsid.localeCompare(b.rsid);
          break;
        case "riskAlleleCount":
          cmp = b.riskAlleleCount - a.riskAlleleCount;
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sortId }: { label: string; sortId: SortKey }) => (
    <button
      onClick={() => toggleSort(sortId)}
      className={`flex items-center gap-1 text-xs uppercase tracking-wide ${
        sortKey === sortId ? "text-white" : "text-gray-500"
      } hover:text-gray-300`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="space-y-4">
      <FilterBar />
      <div className="text-sm text-gray-500">
        Showing {sorted.length} of {variants.length} variants
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="w-8" />
              <th className="px-3 py-2 text-left"><SortHeader label="rsID" sortId="rsid" /></th>
              <th className="px-3 py-2 text-left"><SortHeader label="Gene" sortId="gene" /></th>
              <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Genotype</th>
              <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Risk</th>
              <th className="px-3 py-2 text-left"><SortHeader label="Alleles" sortId="riskAlleleCount" /></th>
              <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Zygosity</th>
              <th className="px-3 py-2 text-left max-w-xs"><SortHeader label="Condition" sortId="severity" /></th>
              <th className="px-3 py-2 text-left"><SortHeader label="Category" sortId="category" /></th>
              <th className="px-3 py-2 text-left text-xs text-gray-500 uppercase">Odds</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v, idx) => {
              const isExpanded = expandedRow === v.rsid;
              const sc = severityColors[v.severity];
              return (
                <React.Fragment key={`${v.rsid}-${idx}`}>
                  <tr
                    onClick={() => setExpandedRow(isExpanded ? null : v.rsid)}
                    className={`border-b border-gray-800/50 cursor-pointer transition-colors hover:bg-gray-800/30 ${
                      isExpanded ? "bg-gray-800/40" : ""
                    }`}
                  >
                    <td className="pl-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-400 text-xs">{v.rsid}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-200">{v.gene}</td>
                    <td className="px-3 py-2 font-mono text-gray-300">{v.genotype}</td>
                    <td className="px-3 py-2 font-mono text-gray-400">{v.riskAllele}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                        v.riskAlleleCount === 2 ? "bg-red-900 text-red-300" :
                        v.riskAlleleCount === 1 ? "bg-yellow-900 text-yellow-300" :
                        "bg-gray-800 text-gray-500"
                      }`}>
                        {v.riskAlleleCount >= 0 ? v.riskAlleleCount : "?"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{v.zygosity}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dot}`} />
                        <span className="text-gray-300 truncate">{v.condition}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{categoryLabels[v.category]}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-400">{v.oddsRatio ?? "—"}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10}>
                        <VariantDetail variant={v} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
