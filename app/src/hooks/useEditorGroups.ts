/**
 * Editor Group types — VSCode IEditorGroupsService pattern.
 *
 * Replaces the hardcoded main/split editor model with an extensible
 * array of EditorGroup, each holding its own tabs and active state.
 * Split = adding a new group. Close group = removing from array.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { EditorTab } from "../components/EditorTabs";

// ─── Types ────────────────────────────────────────────

export interface EditorGroup {
  /** Unique group id */
  id: string;
  /** Tabs in this group */
  tabs: EditorTab[];
  /** Currently active tab id */
  activeTabId: string | null;
}

export interface EditorGroupsState {
  /** All editor groups (1..N) */
  groups: EditorGroup[];
  /** Split direction between groups */
  splitDirection: "horizontal" | "vertical";
}

// ─── Helpers ──────────────────────────────────────────

let groupIdCounter = 0;
function nextGroupId(): string {
  return `group-${++groupIdCounter}`;
}

function createGroup(tabs: EditorTab[] = [], activeTabId: string | null = null): EditorGroup {
  return {
    id: nextGroupId(),
    tabs,
    activeTabId,
  };
}

// ─── Hook ─────────────────────────────────────────────

export interface EditorGroupsAPI {
  groups: EditorGroup[];
  splitDirection: "horizontal" | "vertical";

  /** Open a tab in a specific group (or active group by default) */
  openTab: (tab: EditorTab, groupId?: string) => void;
  /** Close a tab from its group */
  closeTab: (tabId: string, groupId?: string) => void;
  /** Set active tab in a group */
  setActiveTab: (groupId: string, tabId: string) => void;
  /** Update tab content in a group */
  updateContent: (groupId: string, tabId: string, content: string) => void;
  /** Save a tab (mark clean) */
  saveTab: (groupId: string, tabId: string) => void;

  /** Split: create a new group with the given tab */
  splitRight: (tab?: EditorTab) => void;
  splitDown: (tab?: EditorTab) => void;
  /** Close an entire group and move its tabs to another group */
  closeGroup: (groupId: string) => void;
  /** Set split direction */
  setSplitDirection: (dir: "horizontal" | "vertical") => void;

  /** Get the active tab of a group */
  getActiveTab: (groupId: string) => EditorTab | undefined;
  /** Get the active group (first group with focus) */
  activeGroupId: string | null;
}

export function useEditorGroups(initial?: Partial<EditorGroupsState>): EditorGroupsAPI {
  const [groups, setGroups] = useState<EditorGroup[]>(
    initial?.groups ?? [createGroup()]
  );
  const [splitDirection, setSplitDirection] = useState<"horizontal" | "vertical">(
    initial?.splitDirection ?? "horizontal"
  );
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    groups[0]?.id ?? null
  );

  // Ref to track current groups for callbacks
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const openTab = useCallback((tab: EditorTab, groupId?: string) => {
    setGroups((prev) => {
      const targetId = groupId ?? activeGroupId ?? prev[0]?.id;
      return prev.map((g) => {
        if (g.id !== targetId) return g;
        const existing = g.tabs.find((t) => t.path === tab.path);
        if (existing) {
          return { ...g, activeTabId: existing.id };
        }
        return { ...g, tabs: [...g.tabs, tab], activeTabId: tab.id };
      });
    });
    if (groupId) setActiveGroupId(groupId);
  }, [activeGroupId]);

  const closeTab = useCallback((tabId: string, groupId?: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (groupId && g.id !== groupId) return g;
        const tabIdx = g.tabs.findIndex((t) => t.id === tabId);
        if (tabIdx === -1) return g;
        const newTabs = g.tabs.filter((t) => t.id !== tabId);
        const newActiveId =
          g.activeTabId === tabId
            ? (newTabs[Math.min(tabIdx, newTabs.length - 1)]?.id ?? null)
            : g.activeTabId;
        return { ...g, tabs: newTabs, activeTabId: newActiveId };
      })
    );
  }, []);

  const setActiveTab = useCallback((groupId: string, tabId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, activeTabId: tabId } : g))
    );
    setActiveGroupId(groupId);
  }, []);

  const updateContent = useCallback((groupId: string, tabId: string, content: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          tabs: g.tabs.map((t) =>
            t.id === tabId ? { ...t, content, dirty: true } : t
          ),
        };
      })
    );
  }, []);

  const saveTab = useCallback((groupId: string, tabId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          tabs: g.tabs.map((t) =>
            t.id === tabId ? { ...t, dirty: false } : t
          ),
        };
      })
    );
  }, []);

  const splitRight = useCallback((tab?: EditorTab) => {
    setSplitDirection("horizontal");
    setGroups((prev) => {
      const newGroup = createGroup(tab ? [tab] : [], tab?.id ?? null);
      return [...prev, newGroup];
    });
  }, []);

  const splitDown = useCallback((tab?: EditorTab) => {
    setSplitDirection("vertical");
    setGroups((prev) => {
      const newGroup = createGroup(tab ? [tab] : [], tab?.id ?? null);
      return [...prev, newGroup];
    });
  }, []);

  const closeGroup = useCallback((groupId: string) => {
    setGroups((prev) => {
      if (prev.length <= 1) return prev; // Keep at least one group
      return prev.filter((g) => g.id !== groupId);
    });
    setActiveGroupId((prev) => (prev === groupId ? groupsRef.current[0]?.id ?? null : prev));
  }, []);

  const getActiveTab = useCallback((groupId: string): EditorTab | undefined => {
    const group = groupsRef.current.find((g) => g.id === groupId);
    return group?.tabs.find((t) => t.id === group.activeTabId);
  }, []);

  return useMemo(() => ({
    groups,
    splitDirection,
    openTab,
    closeTab,
    setActiveTab,
    updateContent,
    saveTab,
    splitRight,
    splitDown,
    closeGroup,
    setSplitDirection,
    getActiveTab,
    activeGroupId,
  }), [
    groups, splitDirection, openTab, closeTab, setActiveTab,
    updateContent, saveTab, splitRight, splitDown, closeGroup,
    setSplitDirection, getActiveTab, activeGroupId,
  ]);
}
