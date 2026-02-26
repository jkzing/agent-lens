import type { OpenClawPluginConfig } from '../config.js';
import { sanitizeAllowlistedFields } from '../sanitize.js';
import { emitToolCallSpan } from '../telemetry.js';
import { isToolIncluded } from '../tool_filter.js';

export interface BeforeToolCallPayload {
  toolName: string;
  args?: unknown;
  timestamp?: string;
  sessionKey?: string;
  callKey?: string;
}

export interface BeforeToolCallResult {
  accepted: boolean;
  reason?: string;
}

export interface HookRuntimeState {
  callStartTimes: Map<string, number>;
}

function getCallKey(payload: BeforeToolCallPayload): string | undefined {
  if (payload.callKey) {
    return payload.callKey;
  }

  if (payload.sessionKey) {
    return `${payload.sessionKey}:${payload.toolName}`;
  }

  return undefined;
}

export function beforeToolCall(
  payload: BeforeToolCallPayload,
  config: OpenClawPluginConfig,
  state?: HookRuntimeState
): BeforeToolCallResult {
  const isIncluded = isToolIncluded(payload.toolName, config);
  const accepted = config.enabled && isIncluded;
  const reason = config.enabled
    ? isIncluded
      ? 'accepted'
      : 'tool_not_included'
    : 'plugin_disabled';

  if (accepted) {
    const callKey = getCallKey(payload);
    if (callKey) {
      state?.callStartTimes.set(callKey, Date.now());
    }

    emitToolCallSpan(config.emitSpan, {
      toolName: payload.toolName,
      sessionKey: payload.sessionKey,
      status: 'success',
      durationMs: 0,
      input: sanitizeAllowlistedFields(payload.args, config.inputFieldAllowlist, config.maxStringLength)
    });
  }

  return {
    accepted,
    reason
  };
}
