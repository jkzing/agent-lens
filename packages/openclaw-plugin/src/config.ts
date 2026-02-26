import type { TelemetryEmitter } from './telemetry.js';

export interface OpenClawPluginConfig {
  enabled: boolean;
  sampleRate: number;
  includeTools: string[];
  emitSpan?: TelemetryEmitter;
}

export const defaultOpenClawPluginConfig: OpenClawPluginConfig = {
  enabled: true,
  sampleRate: 1,
  includeTools: []
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

  const emitSpan = typeof candidate.emitSpan === 'function'
    ? candidate.emitSpan
    : undefined;

  return {
    enabled,
    sampleRate,
    includeTools,
    emitSpan
  };
}
