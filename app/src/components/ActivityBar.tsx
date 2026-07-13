import { Settings } from "lucide-react";
import { useLocale } from "../i18n/LocaleContext";
import { viewContainers } from "@oceanix/view-container";
import { useState, useEffect } from "react";
import type { IViewDescriptor } from "@oceanix/view-container";

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onOpenSettings?: () => void;
  onOpenAgent?: () => void;
}

export default function ActivityBar({ activeView, onViewChange, onOpenSettings, onOpenAgent }: ActivityBarProps) {
  const { t } = useLocale();
  const [sidebarViews, setSidebarViews] = useState<IViewDescriptor[]>(
    () => viewContainers.getByLocation("sidebar")
  );

  // Re-render when views are registered
  useEffect(() => {
    const unsub = viewContainers.onDidChange(() => {
      setSidebarViews(viewContainers.getByLocation("sidebar"));
    });
    return unsub;
  }, []);

  return (
    <div className="activity-bar">
      <div className="activity-bar-top">
        {sidebarViews.map((view) => {
          const Icon = view.icon;
          const isAction = !!view.action;
          return (
            <button
              key={view.id}
              className={`activity-btn ${activeView === view.id && !isAction ? "active" : ""}`}
              onClick={() => {
                if (isAction) {
                  view.action?.();
                } else {
                  onViewChange(view.id);
                }
              }}
              title={view.name}
            >
              <Icon size={20} />
            </button>
          );
        })}
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
