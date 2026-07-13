/**
 * Lightweight Dependency Injection for React — VSCode InstantiationService pattern.
 *
 * Design:
 *   Services are identified by typed Symbols (ServiceIdentifier<T>).
 *   A ServiceCollection holds service instances keyed by identifier.
 *   ServiceProvider (React Context) makes the collection available.
 *   useService<T>(id) hook retrieves a service from context.
 *
 * Usage:
 *   // Define service identifiers
 *   export const ICommandService = createServiceIdentifier<ICommandService>("command");
 *
 *   // Register in ServiceCollection
 *   const services = new ServiceCollection();
 *   services.set(ICommandService, new CommandService());
 *
 *   // Provide at app root
 *   <ServiceProvider services={services}>
 *     <App />
 *   </ServiceProvider>
 *
 *   // Consume in any component
 *   const cmd = useService(ICommandService);
 *   cmd.executeCommand("sidebar.toggle");
 */

import { createContext, useContext, type ReactNode } from "react";

// ─── Service Identifier ───────────────────────────────

export interface ServiceIdentifier<T> {
  /** Unique name for debugging */
  name: string;
  /** Type marker (unused at runtime) */
  _type: T;
}

/** Create a typed service identifier. */
export function createServiceIdentifier<T>(name: string): ServiceIdentifier<T> {
  return { name, _type: undefined as unknown as T };
}

// ─── Service Collection ───────────────────────────────

export class ServiceCollection {
  private services = new Map<ServiceIdentifier<any>, any>();

  /** Register a service instance. */
  set<T>(id: ServiceIdentifier<T>, instance: T): this {
    this.services.set(id, instance);
    return this;
  }

  /** Get a service instance. Throws if not found. */
  get<T>(id: ServiceIdentifier<T>): T {
    const instance = this.services.get(id);
    if (instance === undefined) {
      throw new Error(`Service not found: ${id.name}`);
    }
    return instance as T;
  }

  /** Check if a service is registered. */
  has<T>(id: ServiceIdentifier<T>): boolean {
    return this.services.has(id);
  }

  /** Create a child collection (inherits parent services, can override). */
  createChild(): ServiceCollection {
    const child = new ServiceCollection();
    for (const [key, value] of this.services) {
      child.services.set(key, value);
    }
    return child;
  }
}

// ─── React Integration ────────────────────────────────

const ServiceContext = createContext<ServiceCollection | null>(null);

export function ServiceProvider({
  services,
  children,
}: {
  services: ServiceCollection;
  children: ReactNode;
}) {
  return (
    <ServiceContext.Provider value={services}>
      {children}
    </ServiceContext.Provider>
  );
}

/** Hook to retrieve a service from the nearest ServiceProvider. */
export function useService<T>(id: ServiceIdentifier<T>): T {
  const collection = useContext(ServiceContext);
  if (!collection) {
    throw new Error(
      `useService(${id.name}): No ServiceProvider found in the component tree. ` +
      `Wrap your app with <ServiceProvider services={...}>`
    );
  }
  return collection.get(id);
}

/** Hook: optionally get a service, returning undefined if not registered. */
export function useOptionalService<T>(id: ServiceIdentifier<T>): T | undefined {
  const collection = useContext(ServiceContext);
  if (!collection || !collection.has(id)) return undefined;
  return collection.get(id);
}
