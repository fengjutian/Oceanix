/**
 * Service Identifiers — typed tokens for the DI container.
 *
 * Pattern: VSCode's createDecorator<T>('serviceName').
 * Each identifier is a typed Symbol used to register/retrieve services.
 */

import { createServiceIdentifier } from "./serviceCollection";
import type { CommandRegistry } from "@oceanix/commands";
import type { ViewContainerRegistry } from "@oceanix/view-container";
import type { IConfigurationService } from "./configuration";

// ─── Existing services that can be registered ──────────

/** Global command registry (singleton from @oceanix/commands) */
export const ICommandRegistry = createServiceIdentifier<CommandRegistry>("commandRegistry");

/** View container registry (singleton from @oceanix/view-container) */
export const IViewContainerRegistry = createServiceIdentifier<ViewContainerRegistry>("viewContainerRegistry");

/** Configuration service */
export const IConfigurationService = createServiceIdentifier<ConfigurationService>("configurationService");

// ─── Future services ──────────────────────────────────

/** Layout service (Phase 4) */
export const ILayoutService = createServiceIdentifier<unknown>("layoutService");

/** Storage service (Phase 6) */
export const IStorageService = createServiceIdentifier<unknown>("storageService");

/** Notification service (Phase 6) */
export const INotificationService = createServiceIdentifier<unknown>("notificationService");
