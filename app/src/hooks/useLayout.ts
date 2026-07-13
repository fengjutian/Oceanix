/**
 * useLayout hook — structured layout state management.
 *
 * Pattern: VSCode's Layout class maintaining ILayoutStateModel.
 * Extracts layout-related state from App.tsx into a single hook
 * with a clean API for toggling panels, switching views, etc.
 *
 * Usage:
 *   const layout = useLayout();
 *   layout.toggleSidebar();
 *   layout.setSidebarView("git");
 *   layout.getDescriptor(); // → LayoutDescriptor for persistence
 */

import { useState, useCallback, useMemo } from "react";
import {
  LayoutDescriptor,
  DEFAULT_LAYOUT,
  type SidebarLayoutState,
  type PanelLayoutState,
  type EditorLayoutState,
} from "../services/layoutTypes";

export interface LayoutAPI {
  // Sidebar
  sidebar: SidebarLayoutState;
  setSidebarView: (view: string) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;

  // Panel
  panel: PanelLayoutState;
  setPanelTab: (tab: string) => void;
  togglePanel: () => void;
  setPanelVisible: (visible: boolean) => void;

  // Editor
  editor: EditorLayoutState;
  toggleSplit: (direction: "horizontal" | "vertical") => void;
  setSplitVisible: (visible: boolean) => void;
  setSplitDirection: (dir: "horizontal" | "vertical") => void;

  // Persistence
  getDescriptor: () => LayoutDescriptor;
  restoreDescriptor: (desc: Partial<LayoutDescriptor>) => void;
}

export function useLayout(initial?: Partial<LayoutDescriptor>): LayoutAPI {
  const merged = { ...DEFAULT_LAYOUT, ...initial };

  const [sidebar, setSidebar] = useState<SidebarLayoutState>(merged.sidebar);
  const [panel, setPanel] = useState<PanelLayoutState>(merged.panel);
  const [editor, setEditor] = useState<EditorLayoutState>(merged.editor);

  // Sidebar actions
  const setSidebarView = useCallback((view: string) => {
    setSidebar((s) => ({ ...s, activeView: view }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebar((s) => ({ ...s, visible: !s.visible }));
  }, []);

  const setSidebarVisible = useCallback((visible: boolean) => {
    setSidebar((s) => ({ ...s, visible }));
  }, []);

  // Panel actions
  const setPanelTab = useCallback((tab: string) => {
    setPanel((p) => ({ ...p, activeTab: tab }));
  }, []);

  const togglePanel = useCallback(() => {
    setPanel((p) => ({ ...p, visible: !p.visible }));
  }, []);

  const setPanelVisible = useCallback((visible: boolean) => {
    setPanel((p) => ({ ...p, visible }));
  }, []);

  // Editor actions
  const toggleSplit = useCallback((direction: "horizontal" | "vertical") => {
    setEditor((e) => {
      if (e.splitVisible && e.splitDirection === direction) {
        return { ...e, splitVisible: false };
      }
      return { ...e, splitVisible: true, splitDirection: direction };
    });
  }, []);

  const setSplitVisible = useCallback((visible: boolean) => {
    setEditor((e) => ({ ...e, splitVisible: visible }));
  }, []);

  const setSplitDirection = useCallback((dir: "horizontal" | "vertical") => {
    setEditor((e) => ({ ...e, splitDirection: dir }));
  }, []);

  // Persistence
  const getDescriptor = useCallback((): LayoutDescriptor => {
    return { sidebar, panel, editor, statusBar: { visible: true } };
  }, [sidebar, panel, editor]);

  const restoreDescriptor = useCallback((desc: Partial<LayoutDescriptor>) => {
    if (desc.sidebar) setSidebar((s) => ({ ...s, ...desc.sidebar }));
    if (desc.panel) setPanel((p) => ({ ...p, ...desc.panel }));
    if (desc.editor) setEditor((e) => ({ ...e, ...desc.editor }));
  }, []);

  return useMemo(() => ({
    sidebar,
    setSidebarView,
    toggleSidebar,
    setSidebarVisible,
    panel,
    setPanelTab,
    togglePanel,
    setPanelVisible,
    editor,
    toggleSplit,
    setSplitVisible,
    setSplitDirection,
    getDescriptor,
    restoreDescriptor,
  }), [
    sidebar, setSidebarView, toggleSidebar, setSidebarVisible,
    panel, setPanelTab, togglePanel, setPanelVisible,
    editor, toggleSplit, setSplitVisible, setSplitDirection,
    getDescriptor, restoreDescriptor,
  ]);
}
