import { useState, useCallback } from "react";

/**
 * Result of useAgentOpener — encapsulates the agent dialog visibility state.
 *
 * Pattern inspired by VSCode's agentSessionsOpener.ts:
 * - `open(task?)` is the single entry point for "Open in Agent" (from sidebar
 *   context menu, activity bar, command palette, etc.)
 * - `close()` tears down the dialog.
 *
 * Future: can be extended with a registry pattern (ISessionOpenerParticipant)
 * so plugins or additional providers can intercept the open flow.
 */
export interface AgentOpener {
  isOpen: boolean;
  initialTask: string | undefined;
  /** Open the agent dialog, optionally pre-filling the task input. */
  open: (task?: string) => void;
  close: () => void;
}

export function useAgentOpener(): AgentOpener {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTask, setInitialTask] = useState<string | undefined>();

  const open = useCallback((task?: string) => {
    setInitialTask(task);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, initialTask, open, close };
}
