/**
 * NotificationService — VSCode INotificationService pattern.
 *
 * Lightweight toast notification system with severity levels.
 * Notifications auto-dismiss after a configurable duration.
 *
 * Usage:
 *   notifications.info("File saved");
 *   notifications.error("Failed to push: " + err);
 *   notifications.warn("File has unsaved changes");
 */

import { useState, useCallback, useSyncExternalStore, useEffect, createContext, useContext, type ReactNode } from "react";

// ─── Types ────────────────────────────────────────────

export type Severity = "info" | "warn" | "error";

export interface Notification {
  id: number;
  message: string;
  severity: Severity;
  timestamp: number;
}

type Listener = () => void;

// ─── Store ────────────────────────────────────────────

let nextId = 1;

class NotificationStore {
  private notifications: Notification[] = [];
  private listeners = new Set<Listener>();
  private defaultDuration = 5000; // ms

  info(message: string): void {
    this.add(message, "info");
  }

  warn(message: string): void {
    this.add(message, "warn");
  }

  error(message: string): void {
    this.add(message, "error");
  }

  private add(message: string, severity: Severity): void {
    const notification: Notification = {
      id: nextId++,
      message,
      severity,
      timestamp: Date.now(),
    };
    this.notifications = [...this.notifications, notification];
    this.notify();

    // Auto-dismiss
    setTimeout(() => this.dismiss(notification.id), this.defaultDuration);
  }

  dismiss(id: number): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  getAll(): ReadonlyArray<Notification> {
    return this.notifications;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const notifications = new NotificationStore();

// ─── React Integration ────────────────────────────────

/** Hook: get current notifications reactively. */
export function useNotifications(): Notification[] {
  return useSyncExternalStore(
    useCallback((cb: Listener) => notifications.subscribe(cb), []),
    () => notifications.getAll() as Notification[]
  );
}

/** Simple toast renderer. Include this near the root of your app. */
export function NotificationToast() {
  const items = useNotifications();

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 32,
      right: 16,
      zIndex: 10000,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      {items.map((n) => {
        const bg = n.severity === "error" ? "#f44747" :
                   n.severity === "warn" ? "#cca700" : "#007acc";
        return (
          <div
            key={n.id}
            onClick={() => notifications.dismiss(n.id)}
            style={{
              background: bg,
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 4,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              maxWidth: 400,
              wordBreak: "break-word",
            }}
          >
            {n.message}
          </div>
        );
      })}
    </div>
  );
}
