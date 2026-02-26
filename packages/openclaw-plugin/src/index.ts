import {
  defaultOpenClawPluginConfig,
  parseOpenClawPluginConfig,
  type OpenClawPluginConfig
} from './config.js';
import {
  beforeToolCall,
  type BeforeToolCallPayload,
  type BeforeToolCallResult
} from './hooks/before_tool_call.js';
import {
  toolResultPersist,
  type ToolResultPersistPayload,
  type ToolResultPersistResult
} from './hooks/tool_result_persist.js';

export interface OpenClawPlugin {
  readonly name: '@agent-lens/openclaw-plugin';
  readonly config: OpenClawPluginConfig;
  before_tool_call: (payload: BeforeToolCallPayload) => BeforeToolCallResult;
  tool_result_persist: (payload: ToolResultPersistPayload) => ToolResultPersistResult;
}

export function createOpenClawPlugin(configInput: unknown = {}): OpenClawPlugin {
  const config = parseOpenClawPluginConfig(configInput);

  return {
    name: '@agent-lens/openclaw-plugin',
    config,
    before_tool_call: (payload) => beforeToolCall(payload, config),
    tool_result_persist: (payload) => toolResultPersist(payload, config)
  };
}

export {
  defaultOpenClawPluginConfig,
  parseOpenClawPluginConfig,
  beforeToolCall,
  toolResultPersist
};

export type {
  OpenClawPluginConfig,
  BeforeToolCallPayload,
  BeforeToolCallResult,
  ToolResultPersistPayload,
  ToolResultPersistResult
};
