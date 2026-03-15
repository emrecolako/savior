import type { MatchedVariant } from "../../types";
import { ExternalLink } from "lucide-react";

interface VariantDetailProps {
  variant: MatchedVariant;
}

export function VariantDetail({ variant }: VariantDetailProps) {
  const dbSnpUrl = `https://www.ncbi.nlm.nih.gov/snp/${variant.rsid}`;
  const clinVarUrl = `https://www.ncbi.nlm.nih.gov/clinvar/?term=${variant.rsid}`;
  const pubMedUrl = `https://pubmed.ncbi.nlm.nih.gov/?term=${variant.rsid}+${variant.gene}`;

  return (
    <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-800 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Clinical Notes</div>
          <p className="text-sm text-gray-300 leading-relaxed">{variant.notes}</p>
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Evidence</div>
            <p className="text-sm text-gray-300">{variant.evidenceLevel}</p>
          </div>
          {variant.oddsRatio && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Odds Ratio</div>
              <p className="text-sm text-gray-300 font-mono">{variant.oddsRatio}</p>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Position</div>
            <p className="text-sm text-gray-300 font-mono">chr{variant.chromosome}:{variant.position.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {variant.tags && variant.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {variant.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {variant.recentFindings && variant.recentFindings.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Recent Research</div>
          <div className="space-y-2">
            {variant.recentFindings.map((f, i) => (
              <div key={i} className="p-2 bg-gray-800/50 rounded border border-gray-700">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline">
                  {f.title}
                </a>
                <p className="text-xs text-gray-500 mt-0.5">{f.source} &middot; {f.date}</p>
                <p className="text-xs text-gray-400 mt-1">{f.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <a href={dbSnpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
          dbSNP <ExternalLink className="w-3 h-3" />
        </a>
        <a href={clinVarUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
          ClinVar <ExternalLink className="w-3 h-3" />
        </a>
        <a href={pubMedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
          PubMed <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
