import {
  defaultOpenClawPluginConfig,
  parseOpenClawPluginConfig,
  type OpenClawPluginConfig
} from './config.js';
import {
  beforeToolCall,
  type BeforeToolCallPayload,
  type BeforeToolCallResult,
  type HookRuntimeState
} from './hooks/before_tool_call.js';
import {
  toolResultPersist,
  type ToolResultPersistPayload,
  type ToolResultPersistResult
} from './hooks/tool_result_persist.js';
import { TOOL_CALL_SPAN_NAME, type TelemetryEmitter, type ToolCallSpanEvent } from './telemetry.js';

export interface OpenClawPlugin {
  readonly name: '@agent-lens/openclaw-plugin';
  readonly config: OpenClawPluginConfig;
  before_tool_call: (payload: BeforeToolCallPayload) => BeforeToolCallResult;
  tool_result_persist: (payload: ToolResultPersistPayload) => ToolResultPersistResult;
}

export function createOpenClawPlugin(configInput: unknown = {}): OpenClawPlugin {
  const config = parseOpenClawPluginConfig(configInput);
  const state: HookRuntimeState = {
    callStartTimes: new Map<string, number>()
  };

  return {
    name: '@agent-lens/openclaw-plugin',
    config,
    before_tool_call: (payload) => beforeToolCall(payload, config, state),
    tool_result_persist: (payload) => toolResultPersist(payload, config, state)
  };
}

export {
  defaultOpenClawPluginConfig,
  parseOpenClawPluginConfig,
  beforeToolCall,
  toolResultPersist,
  TOOL_CALL_SPAN_NAME
};

export type {
  OpenClawPluginConfig,
  BeforeToolCallPayload,
  BeforeToolCallResult,
  ToolResultPersistPayload,
  ToolResultPersistResult,
  TelemetryEmitter,
  ToolCallSpanEvent
};
