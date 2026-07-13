/**
 * Agent configuration (deprecated) — now unified with ConfigurationService.
 *
 * @deprecated Use ConfigurationService.getValue("ai.*") instead.
 *   - maxSteps     → getConfigurationService().getValue<number>("ai.maxSteps")
 *   - temperature  → getConfigurationService().getValue<number>("ai.temperature")
 *   - systemPrompt → getConfigurationService().getValue<string>("ai.systemPrompt")
 *   - model        → getConfigurationService().getValue<string>("ai.chatModel")
 *
 * This file is kept for backward compatibility. All functions delegate
 * to ConfigurationService now.
 */

import { getConfigurationService, ConfigurationTarget } from "./configuration";

export interface AgentConfig {
  maxSteps: number;
  temperature: number;
  systemPrompt: string;
  model: string;
}

export const DEFAULT_CONFIG: AgentConfig = {
  maxSteps: 10,
  temperature: 0.7,
  systemPrompt: "",
  model: "",
};

/**
 * @deprecated Use getConfigurationService().getValue() instead.
 */
export function loadConfig(): AgentConfig {
  const svc = getConfigurationService();
  return {
    maxSteps: svc.getValue<number>("ai.maxSteps") ?? DEFAULT_CONFIG.maxSteps,
    temperature: svc.getValue<number>("ai.temperature") ?? DEFAULT_CONFIG.temperature,
    systemPrompt: svc.getValue<string>("ai.systemPrompt") ?? DEFAULT_CONFIG.systemPrompt,
    model: svc.getValue<string>("ai.chatModel") ?? DEFAULT_CONFIG.model,
  };
}

/**
 * @deprecated Use getConfigurationService().updateValue() instead.
 */
export function saveConfig(config: AgentConfig): void {
  const svc = getConfigurationService();
  svc.updateValue("ai.maxSteps", config.maxSteps, ConfigurationTarget.USER);
  svc.updateValue("ai.temperature", config.temperature, ConfigurationTarget.USER);
  svc.updateValue("ai.systemPrompt", config.systemPrompt, ConfigurationTarget.USER);
  svc.updateValue("ai.chatModel", config.model, ConfigurationTarget.USER);
}
