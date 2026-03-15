import { StatsSummary } from "./StatsSummary";
import { ApoeCard } from "./ApoeCard";
import { PathwayCards } from "./PathwayCards";
import { ActionItems } from "./ActionItems";
import type { DashboardReport } from "../../types";

interface OverviewPanelProps {
  report: DashboardReport;
}

export function OverviewPanel({ report }: OverviewPanelProps) {
  return (
    <div className="space-y-6">
      <StatsSummary variants={report.variants} totalSnps={report.meta.totalSnps} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ApoeCard apoe={report.apoe} />
        <div className="space-y-6">
          <PathwayCards pathways={report.pathways} />
        </div>
      </div>
      <ActionItems items={report.actionItems} />
    </div>
  );
}
