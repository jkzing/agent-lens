import path from 'node:path';
import type { Command } from 'commander';
import { DEFAULTS } from '../config/load.js';
import type { LensConfig, ResolvedConfigSource, ResolvedRuntimeConfig } from '../types.js';

export function sourceFor(isCli: boolean, hasConfig: boolean): ResolvedConfigSource {
  if (isCli) return 'cli';
  if (hasConfig) return 'config';
  return 'default';
}

export function resolveRuntimeConfig(
  cmd: Command,
  opts: Record<string, unknown>,
  loaded: { path: string | null; config: LensConfig }
): ResolvedRuntimeConfig {
  const portSource = cmd.getOptionValueSource('port');
  const dataDirSource = cmd.getOptionValueSource('dataDir');
  const openSource = cmd.getOptionValueSource('open');

  const hasConfigPort = typeof loaded.config.server?.port === 'number';
  const hasConfigDataDir = typeof loaded.config.server?.dataDir === 'string';
  const hasConfigOpen = typeof loaded.config.ui?.open === 'boolean';

  const resolvedPort =
    portSource === 'cli'
      ? Number(opts.port)
      : loaded.config.server?.port ?? DEFAULTS.port;

  const resolvedDataDir =
    dataDirSource === 'cli'
      ? String(opts.dataDir)
      : loaded.config.server?.dataDir ?? DEFAULTS.dataDir;

  const resolvedOpen =
    openSource === 'cli'
      ? opts.open !== false
      : loaded.config.ui?.open ?? DEFAULTS.open;

  if (!Number.isFinite(resolvedPort) || resolvedPort <= 0) {
    throw new Error(`Invalid port: ${String(resolvedPort)}`);
  }

  return {
    port: Math.trunc(resolvedPort),
    dataDir: path.resolve(process.cwd(), resolvedDataDir),
    open: resolvedOpen,
    configPath: loaded.path,
    sources: {
      port: sourceFor(portSource === 'cli', hasConfigPort),
      dataDir: sourceFor(dataDirSource === 'cli', hasConfigDataDir),
      open: sourceFor(openSource === 'cli', hasConfigOpen)
    }
  };
}
