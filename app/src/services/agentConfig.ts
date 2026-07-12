/**
 * Agent configuration — persisted per-session or globally.
 *
 * Pattern: VSCode's chatSessions extension point contributions
 * (capabilities, inputPlaceholder, welcomeMessage) mapped to
 * user-facing settings (model, temperature, maxSteps, systemPrompt).
 */

export interface AgentConfig {
  /** Maximum agent execution steps (1-50). Default: 10 */
  maxSteps: number;
  /** LLM temperature (0-2). Default: 0.7 */
  temperature: number;
  /** System prompt override (empty = use default). */
  systemPrompt: string;
  /** Model ID override (empty = auto-select). */
  model: string;
}

export const DEFAULT_CONFIG: AgentConfig = {
  maxSteps: 10,
  temperature: 0.7,
  systemPrompt: "",
  model: "",
};

const STORAGE_KEY = "oceanix-agent-config";

export function loadConfig(): AgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        maxSteps: clamp(parsed.maxSteps ?? DEFAULT_CONFIG.maxSteps, 1, 50),
        temperature: clamp(parsed.temperature ?? DEFAULT_CONFIG.temperature, 0, 2),
        systemPrompt: typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "",
        model: typeof parsed.model === "string" ? parsed.model : "",
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AgentConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore quota */ }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(v) || min));
}
