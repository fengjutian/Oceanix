/**
 * ViewContainer Registry — VSCode-style extensible views system.
 *
 * Pattern: VSCode's ViewDescriptorService / ViewContainersRegistry.
 * Views are registered declaratively; ActivityBar, Sidebar, and Panel tabs
 * consume the registry rather than hardcoding view lists.
 *
 * Usage:
 *   import { viewContainers } from "@oceanix/view-container";
 *   viewContainers.register({
 *     id: "explorer", name: "Explorer", icon: FolderOpen,
 *     component: FileExplorer, location: "sidebar", order: 0,
 *   });
 *
 *   // In ActivityBar:
 *   const sidebarViews = viewContainers.getByLocation("sidebar");
 *   sidebarViews.map(v => <button onClick={() => activate(v.id)}><v.icon size={20}/></button>)
 *
 *   // In Sidebar:
 *   const ViewComponent = viewContainers.getById(activeView)?.component;
 *   {ViewComponent && <ViewComponent {...props} />}
 */

import type { ComponentType } from "react";

/** Icon component (e.g. Lucide icons: FolderOpen, Search, etc.) */
export type IconComponent = ComponentType<{ size?: number; className?: string }>;

/** Where the view lives in the shell */
export type ViewLocation = "sidebar" | "panel";

/** Descriptor for a single view */
export interface IViewDescriptor {
  /** Unique view ID (e.g. "explorer", "search", "terminal") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Icon component to show in ActivityBar / Panel tab */
  icon: IconComponent;
  /** The React component to render when this view is active */
  component: ComponentType<any>;
  /** Where this view appears */
  location: ViewLocation;
  /** Sort order (lower = first) */
  order?: number;
  /** Whether clicking this view should fire an action instead of showing a panel */
  action?: () => void;
}

type Listener = () => void;

class ViewContainerRegistry {
  private views = new Map<string, IViewDescriptor>();
  private listeners = new Set<Listener>();

  /** Register a view descriptor. Overwrites if id already exists. */
  register(descriptor: IViewDescriptor): void {
    this.views.set(descriptor.id, descriptor);
    this.notify();
  }

  /** Register many views at once. */
  registerMany(descriptors: IViewDescriptor[]): void {
    for (const desc of descriptors) {
      this.views.set(desc.id, desc);
    }
    this.notify();
  }

  /** Unregister a view by id. */
  unregister(id: string): boolean {
    const removed = this.views.delete(id);
    if (removed) this.notify();
    return removed;
  }

  /** Get a view descriptor by id. */
  getById(id: string): IViewDescriptor | undefined {
    return this.views.get(id);
  }

  /** Get all views registered for a given location, sorted by order. */
  getByLocation(location: ViewLocation): IViewDescriptor[] {
    return Array.from(this.views.values())
      .filter((v) => v.location === location)
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /** Get all registered views. */
  getAll(): IViewDescriptor[] {
    return Array.from(this.views.values());
  }

  /** Subscribe to registry changes. Returns unsubscribe function. */
  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Global singleton instance */
export const viewContainers = new ViewContainerRegistry();
