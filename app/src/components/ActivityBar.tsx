import { FolderOpen, Search, GitBranch, Bot, Database } from "lucide-react";

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const icons: Record<string, { icon: React.ReactNode; label: string }> = {
    explorer: { icon: <FolderOpen size={20} />, label: "Explorer" },
    search: { icon: <Search size={20} />, label: "Search" },
    git: { icon: <GitBranch size={20} />, label: "Git" },
    ai: { icon: <Bot size={20} />, label: "AI" },
    rag: { icon: <Database size={20} />, label: "RAG" },
  };

  return (
    <div className="activity-bar">
      {Object.entries(icons).map(([key, { icon, label }]) => (
        <button
          key={key}
          className={`activity-btn ${activeView === key ? "active" : ""}`}
          onClick={() => onViewChange(key)}
          title={label}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
