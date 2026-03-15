import { useState, useMemo } from "react";
import { Header } from "./components/Header";
import { OverviewPanel } from "./components/Overview/OverviewPanel";
import { VariantTable } from "./components/VariantTable/VariantTable";
import { BodyMap } from "./components/BodyMap/BodyMap";
import { TimelineView } from "./components/Timeline/TimelineView";
import { FilterContext, useFilterReducer } from "./hooks/useFilters";
import { useReportData } from "./hooks/useReportData";

export default function App() {
  const { report, fileName, handleDrop, handleFileInput } = useReportData();
  const [activeTab, setActiveTab] = useState("overview");
  const [filterState, filterDispatch] = useFilterReducer();

  const pathwaySlugs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of report.pathways) {
      map.set(p.slug, p.variants.map((v) => v.rsid));
    }
    return map;
  }, [report.pathways]);

  return (
    <FilterContext value={{ state: filterState, dispatch: filterDispatch }}>
      <div className="min-h-screen bg-gray-950">
        <Header
          fileName={fileName}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          {activeTab === "overview" && <OverviewPanel report={report} />}

          {activeTab === "variants" && (
            <VariantTable variants={report.variants} pathwaySlugs={pathwaySlugs} />
          )}

          {activeTab === "bodymap" && (
            <div className="max-w-3xl mx-auto">
              <BodyMap variants={report.variants} />
            </div>
          )}

          {activeTab === "timeline" && <TimelineView variants={report.variants} />}
        </main>
      </div>
    </FilterContext>
  );
}
