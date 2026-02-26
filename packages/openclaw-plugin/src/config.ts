import type { TelemetryEmitter } from './telemetry.js';

export interface OpenClawPluginConfig {
  enabled: boolean;
  sampleRate: number;
  includeTools: string[];
  emitSpan?: TelemetryEmitter;
  maxStringLength: number;
  inputFieldAllowlist: string[];
  outputFieldAllowlist: string[];
}

export const defaultOpenClawPluginConfig: OpenClawPluginConfig = {
  enabled: true,
  sampleRate: 1,
  includeTools: [],
  maxStringLength: 120,
  inputFieldAllowlist: [],
  outputFieldAllowlist: []
};

export function parseOpenClawPluginConfig(
  input: unknown
): OpenClawPluginConfig {
  if (!input || typeof input !== 'object') {
    return { ...defaultOpenClawPluginConfig };
  }

  const candidate = input as Partial<OpenClawPluginConfig>;

  const enabled =
    typeof candidate.enabled === 'boolean'
      ? candidate.enabled
      : defaultOpenClawPluginConfig.enabled;

  const sampleRate =
    typeof candidate.sampleRate === 'number' &&
    Number.isFinite(candidate.sampleRate) &&
    candidate.sampleRate >= 0 &&
    candidate.sampleRate <= 1
      ? candidate.sampleRate
      : defaultOpenClawPluginConfig.sampleRate;

  const includeTools = Array.isArray(candidate.includeTools)
    ? candidate.includeTools.filter((tool): tool is string => typeof tool === 'string')
    : defaultOpenClawPluginConfig.includeTools;

  const maxStringLength =
    typeof candidate.maxStringLength === 'number' &&
    Number.isFinite(candidate.maxStringLength) &&
    candidate.maxStringLength >= 8
      ? Math.floor(candidate.maxStringLength)
      : defaultOpenClawPluginConfig.maxStringLength;

  const inputFieldAllowlist = Array.isArray(candidate.inputFieldAllowlist)
    ? candidate.inputFieldAllowlist.filter((field): field is string => typeof field === 'string')
    : defaultOpenClawPluginConfig.inputFieldAllowlist;

  const outputFieldAllowlist = Array.isArray(candidate.outputFieldAllowlist)
    ? candidate.outputFieldAllowlist.filter((field): field is string => typeof field === 'string')
    : defaultOpenClawPluginConfig.outputFieldAllowlist;

  const emitSpan = typeof candidate.emitSpan === 'function'
    ? candidate.emitSpan
    : undefined;

  return {
    enabled,
    sampleRate,
    includeTools,
    emitSpan,
    maxStringLength,
    inputFieldAllowlist,
    outputFieldAllowlist
  };
}
