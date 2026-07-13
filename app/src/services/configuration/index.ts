/**
 * Configuration module — barrel export.
 *
 * Usage:
 *   import { getConfigurationService, ConfigurationTarget } from "./services/configuration";
 */

// Registry
export {
  ConfigurationScope,
  ConfigurationTarget,
  configurationRegistry,
} from "./configurationRegistry";
export type {
  IConfigurationPropertySchema,
  IConfigurationNode,
  IConfigurationRegistry,
  ConfigurationProperties,
} from "./configurationRegistry";

// Models
export {
  ConfigurationModel,
  Configuration,
} from "./configurationModels";
export type {
  IConfigurationModel,
  IConfigurationInspectValue,
} from "./configurationModels";

// Service
export {
  ConfigurationService,
  getConfigurationService,
  setConfigurationService,
} from "./configurationService";
export type {
  IConfigurationService,
  IConfigurationPersistence,
  ConfigurationChangeEvent,
} from "./configurationService";

// Defaults
export { registerDefaultConfigurations } from "./configurationDefaults";
