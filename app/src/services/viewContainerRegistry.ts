/**
 * ViewContainer Registry — VSCode-style extensible views system.
 *
 * Usage:
 *   import { viewContainers } from "../services/viewContainerRegistry";
 *   viewContainers.register({ id: "explorer", name: "Explorer", icon: FolderOpen, component: FileExplorer, location: "sidebar", order: 0 });
 */

import type { ComponentType } from "react";

export type IconComponent = ComponentType<{ size?: number; className?: string }>;
export type ViewLocation = "sidebar" | "panel";

export interface IViewDescriptor {
  id: string;
  name: string;
  icon: IconComponent;
  component: ComponentType<any>;
  location: ViewLocation;
  order?: number;
  action?: () => void;
}

type Listener = () => void;

class ViewContainerRegistry {
  private views = new Map<string, IViewDescriptor>();
  private listeners = new Set<Listener>();

  register(descriptor: IViewDescriptor): void {
    this.views.set(descriptor.id, descriptor);
    this.notify();
  }

  registerMany(descriptors: IViewDescriptor[]): void {
    for (const desc of descriptors) {
      this.views.set(desc.id, desc);
    }
    this.notify();
  }

  unregister(id: string): boolean {
    const removed = this.views.delete(id);
    if (removed) this.notify();
    return removed;
  }

  getById(id: string): IViewDescriptor | undefined {
    return this.views.get(id);
  }

  getByLocation(location: ViewLocation): IViewDescriptor[] {
    return Array.from(this.views.values())
      .filter((v) => v.location === location)
      .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  getAll(): IViewDescriptor[] {
    return Array.from(this.views.values());
  }

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

export const viewContainers = new ViewContainerRegistry();
