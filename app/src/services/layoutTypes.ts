/**
 * Layout types — declarative workbench layout descriptor.
 *
 * Pattern: VSCode's ISerializedGrid / ISerializableView (Part).
 * The layout is described as a pure data tree; the rendering layer
 * maps it to react-resizable-panels.
 */

// ─── Part Interface (VSCode Part extends ISerializableView) ──

/** A dockable panel that conforms to the layout grid. */
export interface IPart {
  /** Unique part identifier */
  readonly id: string;
  /** Minimum width in pixels */
  readonly minimumWidth?: number;
  /** Maximum width in pixels */
  readonly maximumWidth?: number;
  /** Minimum height in pixels */
  readonly minimumHeight?: number;
  /** Maximum height in pixels */
  readonly maximumHeight?: number;
  /** Preferred default size (percentage or pixels) */
  readonly preferredSize?: number;
}

// ─── Layout Descriptor (VSCode SerializableGrid) ──

export interface SidebarLayoutState {
  visible: boolean;
  activeView: string;
  /** Width percentage (0-100) */
  width: number;
  /** Minimum width percentage */
  minWidth: number;
  /** Maximum width percentage */
  maxWidth: number;
}

export interface PanelLayoutState {
  visible: boolean;
  activeTab: string;
  /** Height percentage (0-100) when panel is at bottom */
  height: number;
  minHeight: number;
  maxHeight: number;
}

export interface EditorLayoutState {
  /** Whether split editor is visible */
  splitVisible: boolean;
  /** Split direction */
  splitDirection: "horizontal" | "vertical";
  /** Main editor size percentage */
  mainSize: number;
  /** Split editor size percentage */
  splitSize: number;
}

export interface StatusBarLayoutState {
  visible: boolean;
}

export interface LayoutDescriptor {
  sidebar: SidebarLayoutState;
  panel: PanelLayoutState;
  editor: EditorLayoutState;
  statusBar: StatusBarLayoutState;
}

// ─── Default layout ────────────────────────────────────

export const DEFAULT_LAYOUT: LayoutDescriptor = {
  sidebar: {
    visible: true,
    activeView: "explorer",
    width: 20,
    minWidth: 15,
    maxWidth: 40,
  },
  panel: {
    visible: false,
    activeTab: "terminal",
    height: 25,
    minHeight: 10,
    maxHeight: 50,
  },
  editor: {
    splitVisible: false,
    splitDirection: "horizontal",
    mainSize: 50,
    splitSize: 50,
  },
  statusBar: {
    visible: true,
  },
};

// ─── Built-in part IDs (VSCode Parts enum) ─────────────

export const enum Parts {
  ACTIVITYBAR = "activityBar",
  SIDEBAR = "sidebar",
  EDITOR = "editor",
  PANEL = "panel",
  STATUSBAR = "statusBar",
}
