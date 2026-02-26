import type { OpenClawPluginConfig } from './config.js';

export function isToolIncluded(toolName: string, config: OpenClawPluginConfig): boolean {
  if (config.includeTools.length === 0) {
    return true;
  }

  return config.includeTools.includes(toolName);
}
