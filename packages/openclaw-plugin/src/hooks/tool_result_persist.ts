import type { OpenClawPluginConfig } from '../config.js';
import { emitToolCallSpan, normalizeErrorMessage } from '../telemetry.js';
import type { HookRuntimeState } from './before_tool_call.js';

export interface ToolResultPersistPayload {
  toolName: string;
  success: boolean;
  result?: unknown;
  timestamp?: string;
  sessionKey?: string;
  callKey?: string;
  durationMs?: number;
  error?: unknown;
}

export interface ToolResultPersistResult {
  persisted: boolean;
}

function getCallKey(payload: ToolResultPersistPayload): string | undefined {
  if (payload.callKey) {
    return payload.callKey;
  }

  if (payload.sessionKey) {
    return `${payload.sessionKey}:${payload.toolName}`;
  }

  return undefined;
}

function resolveDurationMs(payload: ToolResultPersistPayload, state?: HookRuntimeState): number {
  if (typeof payload.durationMs === 'number' && Number.isFinite(payload.durationMs) && payload.durationMs >= 0) {
    return payload.durationMs;
  }

  const callKey = getCallKey(payload);
  if (!callKey) {
    return 0;
  }

  const start = state?.callStartTimes.get(callKey);
  if (typeof start !== 'number') {
    return 0;
  }

  state?.callStartTimes.delete(callKey);
  return Math.max(0, Date.now() - start);
}

export function toolResultPersist(
  payload: ToolResultPersistPayload,
  config: OpenClawPluginConfig,
  state?: HookRuntimeState
): ToolResultPersistResult {
  const persisted = config.enabled;
  const status = payload.success ? 'success' : 'error';
  const fallbackError = payload.success ? undefined : normalizeErrorMessage(payload.error ?? payload.result);

  emitToolCallSpan(config.emitSpan, {
    toolName: payload.toolName,
    sessionKey: payload.sessionKey,
    status,
    durationMs: resolveDurationMs(payload, state),
    error: fallbackError
  });

  return {
    persisted
  };
}
