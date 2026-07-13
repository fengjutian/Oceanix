/**
 * ContextKeyService — VSCode IContextKeyService pattern.
 *
 * A lightweight boolean context map that drives conditional UI visibility.
 * Any component can set a context key; any component can read it.
 * The <When> component conditionally renders children based on context.
 *
 * Usage:
 *   contextKeys.set("editorHasSelection", true);
 *   <When context="editorHasSelection">Run Selected</When>
 */

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from "react";

type Listener = () => void;

class ContextKeyStore {
  private keys = new Map<string, boolean>();
  private listeners = new Set<Listener>();

  set(key: string, value: boolean): void {
    if (this.keys.get(key) === value) return;
    this.keys.set(key, value);
    this.notify();
  }

  get(key: string): boolean {
    return this.keys.get(key) ?? false;
  }

  toggle(key: string): void {
    this.set(key, !this.get(key));
  }

  /** Batch-set multiple context keys at once. */
  setMany(entries: Record<string, boolean>): void {
    let changed = false;
    for (const [key, value] of Object.entries(entries)) {
      if (this.keys.get(key) !== value) {
        this.keys.set(key, value);
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Get a snapshot for useSyncExternalStore */
  getSnapshot = (): Map<string, boolean> => {
    return new Map(this.keys);
  };

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Global singleton */
export const contextKeys = new ContextKeyStore();

// ─── React Integration ────────────────────────────────

const ContextKeyContext = createContext<ContextKeyStore>(contextKeys);

export function ContextKeyProvider({ children }: { children: ReactNode }) {
  return (
    <ContextKeyContext.Provider value={contextKeys}>
      {children}
    </ContextKeyContext.Provider>
  );
}

/** Hook to read a context key reactively. */
export function useContextKey(key: string): boolean {
  const store = useContext(ContextKeyContext);
  return useSyncExternalStore(
    useCallback((cb: Listener) => store.subscribe(cb), [store]),
    () => store.get(key)
  );
}

/** Hook to get the setter for context keys. */
export function useContextKeys() {
  const store = useContext(ContextKeyContext);
  return {
    set: useCallback((key: string, value: boolean) => store.set(key, value), [store]),
    get: useCallback((key: string) => store.get(key), [store]),
    toggle: useCallback((key: string) => store.toggle(key), [store]),
    setMany: useCallback((entries: Record<string, boolean>) => store.setMany(entries), [store]),
  };
}

/** Conditionally render children based on a context key. */
export function When({ context, children }: { context: string; children: ReactNode }) {
  const value = useContextKey(context);
  return value ? <>{children}</> : null;
}
