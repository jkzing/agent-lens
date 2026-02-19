import path from 'node:path';
import type { Command } from 'commander';
import { initDefaultConfig } from '../config/init.js';
import {
  defaultJsonPath,
  defaultTomlPath,
  discoverConfigPath,
  loadConfig,
  parseConfigFile,
  validateConfig,
} from '../config/load.js';
import { formatConfigOutput } from '../output/format.js';
import { resolveRuntimeConfig } from '../runtime/resolve.js';

export function registerConfigCommand(program: Command): void {
  const configCmd = program.command('config').description('manage agent-lens config file');

  configCmd
    .command('init')
    .description('create default config at ~/.agent-lens/config.toml')
    .action(() => {
      try {
        const result = initDefaultConfig();
        console.log(`[agent-lens] created ${result.createdPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exit(1);
      }
    });

  configCmd
    .command('validate')
    .description('validate config file')
    .option('--config <path>', 'path to config file (default: auto-discovery)')
    .action((opts) => {
      const rootOpts = program.opts<Record<string, unknown>>();
      const configOpt = typeof opts.config === 'string' ? opts.config : rootOpts.config;
      const explicit = typeof configOpt === 'string' ? configOpt : undefined;
      const configPath = explicit ? path.resolve(process.cwd(), explicit) : discoverConfigPath();

      if (!configPath) {
        console.error(`[agent-lens] no config file found (expected ${defaultTomlPath} or ${defaultJsonPath})`);
        process.exit(1);
      }

      try {
        const raw = parseConfigFile(configPath);
        const result = validateConfig(raw, path.basename(configPath));
        if (result.errors.length > 0) {
          console.error(`[agent-lens] invalid config: ${configPath}`);
          for (const msg of result.errors) {
            console.error(`  - ${msg}`);
          }
          process.exit(1);
        }
        console.log(`[agent-lens] config is valid: ${configPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent-lens] failed to validate config: ${message}`);
        process.exit(1);
      }
    });

  configCmd
    .command('print')
    .description('print resolved runtime config (without starting server)')
    .option('-p, --port <number>', 'server port override')
    .option('--data-dir <path>', 'data directory path override')
    .option('--config <path>', 'path to config file (default: auto-discovery)')
    .option('--no-open', 'disable auto-open browser')
    .option('--format <format>', 'output format: json|toml', 'json')
    .action((opts) => {
      const rootOpts = program.opts<Record<string, unknown>>();
      const mergedOpts = { ...opts, ...rootOpts } as Record<string, unknown>;
      const format = String(mergedOpts.format ?? 'json').toLowerCase();
      if (format !== 'json' && format !== 'toml') {
        console.error(`[agent-lens] unsupported format: ${format} (expected json|toml)`);
        process.exit(1);
      }

      const loaded = loadConfig(typeof mergedOpts.config === 'string' ? mergedOpts.config : undefined);
      const runtime = resolveRuntimeConfig(program, mergedOpts, loaded);

      console.log(formatConfigOutput(runtime, format));
    });
}
