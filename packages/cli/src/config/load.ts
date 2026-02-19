import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as TOML from '@iarna/toml';
import type { LensConfig } from '../types.js';

export const appHome = path.join(os.homedir(), '.agent-lens');
export const defaultTomlPath = path.join(appHome, 'config.toml');
export const defaultJsonPath = path.join(appHome, 'config.json');

export const DEFAULTS = {
  port: 4318,
  open: true,
  dataDir: path.join(appHome, 'data')
} as const;

export function discoverConfigPath(existsSync: (filePath: string) => boolean = fs.existsSync): string | null {
  if (existsSync(defaultTomlPath)) return defaultTomlPath;
  if (existsSync(defaultJsonPath)) return defaultJsonPath;
  return null;
}

export function parseConfigFile(configPath: string, readFileSync: typeof fs.readFileSync = fs.readFileSync): unknown {
  const content = readFileSync(configPath, 'utf8');
  if (configPath.endsWith('.toml')) {
    return TOML.parse(content);
  }
  if (configPath.endsWith('.json')) {
    return JSON.parse(content);
  }
  throw new Error(`Unsupported config format: ${configPath}`);
}

export function validateConfig(config: unknown, source = 'config'): { config: LensConfig; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { config: {}, errors: [`${source} must be an object`] };
  }

  const obj = config as Record<string, unknown>;
  const out: LensConfig = {};

  if ('server' in obj) {
    if (!obj.server || typeof obj.server !== 'object' || Array.isArray(obj.server)) {
      errors.push(`${source}.server must be an object`);
    } else {
      const server = obj.server as Record<string, unknown>;
      const normalized: NonNullable<LensConfig['server']> = {};

      if ('port' in server) {
        if (typeof server.port !== 'number' || !Number.isFinite(server.port)) {
          errors.push(`${source}.server.port must be a number`);
        } else {
          normalized.port = Math.trunc(server.port);
        }
      }

      if ('dataDir' in server) {
        if (typeof server.dataDir !== 'string' || !server.dataDir.trim()) {
          errors.push(`${source}.server.dataDir must be a non-empty string`);
        } else {
          normalized.dataDir = server.dataDir;
        }
      }

      out.server = normalized;
    }
  }

  if ('ui' in obj) {
    if (!obj.ui || typeof obj.ui !== 'object' || Array.isArray(obj.ui)) {
      errors.push(`${source}.ui must be an object`);
    } else {
      const ui = obj.ui as Record<string, unknown>;
      const normalized: NonNullable<LensConfig['ui']> = {};

      if ('open' in ui) {
        if (typeof ui.open !== 'boolean') {
          errors.push(`${source}.ui.open must be a boolean`);
        } else {
          normalized.open = ui.open;
        }
      }

      out.ui = normalized;
    }
  }

  return { config: out, errors };
}

export function loadConfig(explicitPath?: string): { path: string | null; config: LensConfig } {
  const configPath = explicitPath ? path.resolve(process.cwd(), explicitPath) : discoverConfigPath();
  if (!configPath) {
    return { path: null, config: {} };
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const parsed = parseConfigFile(configPath);
  const { config, errors } = validateConfig(parsed, path.basename(configPath));

  if (errors.length > 0) {
    const lines = errors.map((msg) => `  - ${msg}`).join('\n');
    throw new Error(`Invalid config in ${configPath}:\n${lines}`);
  }

  return { path: configPath, config };
}
