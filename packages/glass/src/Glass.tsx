import { type ComponentProps, type ReactNode, type CSSProperties } from "react";

/* ══════════════════════════════════════════════════════════════
   Glass (Glassmorphism) — thin React wrappers
   @oceanix/glass
   ══════════════════════════════════════════════════════════════ */

type DivProps = ComponentProps<"div">;
type ButtonProps = ComponentProps<"button">;
type InputProps = ComponentProps<"input">;

// ─── GlassPanel ──────────────────────────────────

export interface GlassPanelProps extends DivProps {
  /** "sm" | "lg" — default is standard (12px radius). */
  size?: "sm" | "lg";
}

export function GlassPanel({ size, className, children, style, ...rest }: GlassPanelProps) {
  const cls = size ? `glass-panel-${size}` : "glass-panel";
  return (
    <div className={[cls, className].filter(Boolean).join(" ")} style={style} {...rest}>
      {children}
    </div>
  );
}

// ─── GlassCard ───────────────────────────────────

export interface GlassCardProps extends DivProps {
  interactive?: boolean;
}

export function GlassCard({ interactive, className, children, style, ...rest }: GlassCardProps) {
  const cls = ["glass-card", interactive && "interactive", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} {...rest}>
      {children}
    </div>
  );
}

// ─── GlassBtn ────────────────────────────────────

export interface GlassBtnProps extends ButtonProps {
  accent?: boolean;
}

export function GlassBtn({ accent, className, children, style, ...rest }: GlassBtnProps) {
  const cls = ["glass-btn", accent && "glass-btn-accent", className].filter(Boolean).join(" ");
  return (
    <button className={cls} style={style} {...rest}>
      {children}
    </button>
  );
}

// ─── GlassInput ──────────────────────────────────

export function GlassInput({ className, style, ...rest }: InputProps) {
  const cls = ["glass-input", className].filter(Boolean).join(" ");
  return <input className={cls} style={style} {...rest} />;
}

// ─── GlassDialog (modal) ─────────────────────────

export interface GlassDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional extra class on the dialog box itself. */
  dialogClassName?: string;
}

export function GlassDialog({ open, onClose, children, dialogClassName }: GlassDialogProps) {
  if (!open) return null;
  return (
    <div className="glass-overlay" onClick={onClose}>
      <div
        className={["glass-dialog", dialogClassName].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── GlassDivider ────────────────────────────────

export function GlassDivider({ style }: { style?: CSSProperties }) {
  return <hr className="glass-divider" style={style} />;
}

// ─── GlassSubtle (light-touch glass background) ──

export function GlassSubtle({ className, children, style, ...rest }: DivProps) {
  const cls = ["glass-subtle", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style} {...rest}>
      {children}
    </div>
  );
}
