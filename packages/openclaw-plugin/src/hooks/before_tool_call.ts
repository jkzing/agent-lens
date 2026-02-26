import type { OpenClawPluginConfig } from '../config.js';

export interface BeforeToolCallPayload {
  toolName: string;
  args?: unknown;
  timestamp?: string;
}

export interface BeforeToolCallResult {
  accepted: boolean;
  reason?: string;
}

export function beforeToolCall(
  payload: BeforeToolCallPayload,
  config: OpenClawPluginConfig
): BeforeToolCallResult {
  const includeListIsActive = config.includeTools.length > 0;
  const isIncluded = !includeListIsActive || config.includeTools.includes(payload.toolName);

  return {
    accepted: config.enabled && isIncluded,
    reason: config.enabled
      ? isIncluded
        ? 'accepted'
        : 'tool_not_included'
      : 'plugin_disabled'
  };
}
