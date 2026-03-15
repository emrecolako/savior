import { Upload, Dna } from "lucide-react";

interface HeaderProps {
  fileName: string;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "variants", label: "Variants" },
  { id: "bodymap", label: "Body Map" },
  { id: "timeline", label: "Timeline" },
];

export function Header({ fileName, onDrop, onFileInput, activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Dna className="w-6 h-6 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Genomic Dashboard</h1>
            <span className="hidden sm:inline text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {fileName}
            </span>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex items-center gap-2"
          >
            <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg cursor-pointer text-sm text-gray-300 transition-colors">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Load Report</span>
              <input
                type="file"
                accept=".json"
                onChange={onFileInput}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-purple-500 text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
