import { useState, useCallback } from "react";
import type { DashboardReport } from "../types";
import sampleData from "../data/sample-report.json";

export function useReportData() {
  const [report, setReport] = useState<DashboardReport>(sampleData as unknown as DashboardReport);
  const [fileName, setFileName] = useState<string>("sample-report.json");

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Handle both full pathway objects and rsid-only pathways
        if (data.pathways && data.variants) {
          data.pathways = data.pathways.map((p: any) => ({
            ...p,
            variants: Array.isArray(p.variants)
              ? p.variants.map((v: any) =>
                  typeof v === "string"
                    ? data.variants.find((mv: any) => mv.rsid === v) || { rsid: v, gene: "?", condition: "Unknown", category: "other", severity: "informational" }
                    : v
                )
              : [],
          }));
        }
        setReport(data);
        setFileName(file.name);
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  return { report, fileName, handleDrop, handleFileInput };
}
