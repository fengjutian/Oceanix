import { useState, useEffect } from "react";
import { FilePlus, FolderOpen, History, Settings, FileText, Copy, Terminal } from "lucide-react";
import { getRecentProjects } from "../services/api";
import { useLocale } from "../i18n/LocaleContext";
import { executeCommand } from "../services/commandBus";
import { GlassPanel, GlassCard, GlassBtn } from "@oceanix/glass";

/**
 * WelcomePage — VS Code-style welcome / get started page.
 * Shown when no editor tabs are open.
 */
export default function WelcomePage() {
  const { t } = useLocale();
  const [recentProjects, setRecentProjects] = useState<
    Array<{ path: string; name: string; lastOpened: string }>
  >([]);

  useEffect(() => {
    getRecentProjects()
      .then((list) => setRecentProjects(list.slice(0, 6)))
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
      }}
    >
      <GlassPanel
        size="lg"
        style={{
          maxWidth: 680,
          width: "100%",
          padding: "48px 32px",
          textAlign: "center",
        }}
      >
        {/* Logo / Title */}
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 200,
              color: "var(--text-primary)",
              letterSpacing: "-1px",
              marginBottom: 4,
            }}
          >
            Oceanix
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Next-generation code editor
          </div>
        </div>

        {/* Quick actions */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 32,
          }}
        >
          <ActionCard
            icon={<FilePlus size={18} />}
            label="New File"
            shortcut="Ctrl+N"
            onClick={() => executeCommand("file.new")}
          />
          <ActionCard
            icon={<FolderOpen size={18} />}
            label="Open Folder"
            shortcut="Ctrl+O"
            onClick={() => executeCommand("file.openFolder")}
          />
          <ActionCard
            icon={<Settings size={18} />}
            label="Settings"
            shortcut="Ctrl+,"
            onClick={() => executeCommand("settings.open")}
          />
          <ActionCard
            icon={<Terminal size={18} />}
            label="Toggle Panel"
            shortcut="Ctrl+J"
            onClick={() => executeCommand("panel.toggle")}
          />
        </div>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--text-secondary)",
                marginBottom: 8,
                paddingLeft: 4,
              }}
            >
              Recent
            </div>
            <GlassCard
              style={{
                padding: 0,
                overflow: "hidden",
              }}
            >
              {recentProjects.map((p, i) => (
                <RecentItem
                  key={p.path}
                  name={p.name}
                  path={p.path}
                  lastOpened={p.lastOpened}
                  isLast={i === recentProjects.length - 1}
                  t={t as unknown as (key: string) => string}
                />
              ))}
            </GlassCard>
          </div>
        )}

        {/* Footer shortcuts */}
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 16,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <FooterLink
            icon={<Copy size={12} />}
            label={t("welcome.commandPalette")}
            shortcut="Ctrl+Shift+P"
          />
          <FooterLink
            icon={<FileText size={12} />}
            label={t("welcome.quickOpen")}
            shortcut="Ctrl+P"
          />
          <FooterLink
            icon={<History size={12} />}
            label={t("welcome.toggleTheme")}
            shortcut="Ctrl+K Ctrl+T"
          />
        </div>
      </GlassPanel>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────

function ActionCard({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <GlassCard
      interactive
      onClick={onClick}
      className={undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
      }}
    >
      <span style={{ color: "var(--text-secondary)", display: "flex" }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--text-primary)",
          flex: 1,
          textAlign: "left",
        }}
      >
        {label}
      </span>
      <GlassBtn
        disabled
        style={{
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 3,
          cursor: "default",
        }}
      >
        {shortcut}
      </GlassBtn>
    </GlassCard>
  );
}

function RecentItem({
  name,
  path,
  lastOpened,
  isLast,
  t,
}: {
  name: string;
  path: string;
  lastOpened: string;
  isLast: boolean;
  t: (key: string) => string;
}) {
  return (
    <div
      title={path}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: 13,
        borderBottom: isLast ? "none" : "1px solid var(--glass-border)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "var(--glass-bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "transparent";
      }}
    >
      <FolderOpen
        size={14}
        style={{ color: "var(--text-secondary)", marginRight: 10, flexShrink: 0 }}
      />
      <span
        style={{
          color: "var(--text-primary)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-secondary)",
          marginLeft: 8,
          whiteSpace: "nowrap",
        }}
      >
        {formatRelativeTime(lastOpened, t)}
      </span>
    </div>
  );
}

function FooterLink({
  icon,
  label,
  shortcut,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <span style={{ display: "flex" }}>{icon}</span>
      <span>{label}</span>
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 10,
          background: "var(--bg-tertiary)",
          padding: "1px 4px",
          borderRadius: 3,
        }}
      >
        {shortcut}
      </span>
    </div>
  );
}

// ── Time formatting ─────────────────────────────────────

function formatRelativeTime(iso: string, t: (key: string) => string): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t("common.justNow");
    if (diffMin < 60) return `${diffMin}${t("common.mAgo")}`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}${t("common.hAgo")}`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}${t("common.dAgo")}`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
