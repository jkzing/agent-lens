import type { OpenClawPluginConfig } from '../config.js';

export interface ToolResultPersistPayload {
  toolName: string;
  success: boolean;
  result?: unknown;
  timestamp?: string;
}

export interface ToolResultPersistResult {
  persisted: boolean;
}

export function toolResultPersist(
  _payload: ToolResultPersistPayload,
  config: OpenClawPluginConfig
): ToolResultPersistResult {
  return {
    persisted: config.enabled
  };
}
