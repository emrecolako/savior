import { useState } from "react";
import { priorityColors } from "../../utils/colors";
import type { ActionItem } from "../../types";
import { AlertCircle, ChevronDown, ChevronRight, Stethoscope, Pill, Salad, FlaskConical, Activity } from "lucide-react";

interface ActionItemsProps {
  items: ActionItem[];
}

const priorityOrder = ["urgent", "recommended", "consider", "informational"] as const;

const categoryIcons: Record<string, React.ElementType> = {
  screening: Stethoscope,
  pharmacogenomics: Pill,
  lifestyle: Salad,
  supplement: FlaskConical,
  monitoring: Activity,
};

export function ActionItems({ items }: ActionItemsProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const grouped = priorityOrder
    .map((p) => ({ priority: p, items: items.filter((i) => i.priority === p) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Action Items</h3>
      </div>
      <div className="space-y-3">
        {grouped.map((group) => (
          <div key={group.priority}>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${priorityColors[group.priority].text}`}>
              {group.priority} ({group.items.length})
            </div>
            <div className="space-y-1">
              {group.items.map((item, i) => {
                const globalIdx = items.indexOf(item);
                const isOpen = expanded.has(globalIdx);
                const Icon = categoryIcons[item.category] || AlertCircle;
                return (
                  <div key={i} className={`border rounded-lg ${priorityColors[item.priority].bg} border-gray-700`}>
                    <button
                      onClick={() => toggle(globalIdx)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      )}
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-200">{item.title}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pl-10 text-sm text-gray-400">
                        <p>{item.detail}</p>
                        {item.relatedVariants.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.relatedVariants.map((v) => (
                              <span key={v} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300 font-mono">
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
