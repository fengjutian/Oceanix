import { FolderOpen, Search, GitBranch, Bot, Database, Settings } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onOpenSettings?: () => void;
}

export default function ActivityBar({ activeView, onViewChange, onOpenSettings }: ActivityBarProps) {
  const { t } = useLocale();
  const icons: Record<string, { icon: React.ReactNode; label: string }> = {
    explorer: { icon: <FolderOpen size={20} />, label: t("activity.explorer") },
    search: { icon: <Search size={20} />, label: t("activity.search") },
    git: { icon: <GitBranch size={20} />, label: t("activity.git") },
    ai: { icon: <Bot size={20} />, label: t("activity.ai") },
    rag: { icon: <Database size={20} />, label: t("activity.rag") },
  };

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
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
      <div className="activity-bar-bottom">
        <button
          className="activity-btn"
          onClick={onOpenSettings}
          title={t("menu.view.settings")}
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
