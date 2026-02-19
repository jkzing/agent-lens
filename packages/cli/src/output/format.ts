import * as TOML from '@iarna/toml';
import type { ResolvedRuntimeConfig } from '../types.js';

export function formatConfigOutput(runtime: ResolvedRuntimeConfig, format: string): string {
  if (format === 'toml') {
    const tomlPayload = {
      port: runtime.port,
      dataDir: runtime.dataDir,
      open: runtime.open,
      configPath: runtime.configPath ?? 'null',
      sources: runtime.sources
    };
    return TOML.stringify(tomlPayload).trimEnd();
  }

  return JSON.stringify(runtime, null, 2);
}
