interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const icons: Record<string, string> = {
    explorer: "📁",
    search: "🔍",
    git: "⎇",
    ai: "🤖",
  };

  return (
    <div className="activity-bar">
      {Object.entries(icons).map(([key, icon]) => (
        <button
          key={key}
          className={`activity-btn ${activeView === key ? "active" : ""}`}
          onClick={() => onViewChange(key)}
          title={key}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
