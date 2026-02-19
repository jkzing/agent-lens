#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { initDefaultConfig } from './config/init.js';
import {
  defaultJsonPath,
  defaultTomlPath,
  discoverConfigPath,
  loadConfig,
  parseConfigFile,
  validateConfig,
} from './config/load.js';
import { formatConfigOutput } from './output/format.js';
import { resolveRuntimeConfig } from './runtime/resolve.js';
import { launchServer } from './server/launch.js';

async function main() {
  const program = new Command();

  program
    .name('agent-lens')
    .description('Zero-config local OTEL receiver and UI for AI agent observability')
    .option('-p, --port <number>', 'server port')
    .option('--data-dir <path>', 'data directory path')
    .option('--config <path>', 'path to config file (TOML/JSON)')
    .option('--no-open', 'disable auto-open browser')
    .action(async (opts) => {
      const loaded = loadConfig(typeof opts.config === 'string' ? opts.config : undefined);
      const runtime = resolveRuntimeConfig(program, opts as Record<string, unknown>, loaded);
      launchServer(runtime, loaded.path);
    });

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
      const explicit = typeof opts.config === 'string' ? opts.config : undefined;
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
    .action((opts, cmd) => {
      const format = String(opts.format ?? 'json').toLowerCase();
      if (format !== 'json' && format !== 'toml') {
        console.error(`[agent-lens] unsupported format: ${format} (expected json|toml)`);
        process.exit(1);
      }

      const loaded = loadConfig(typeof opts.config === 'string' ? opts.config : undefined);
      const runtime = resolveRuntimeConfig(cmd, opts as Record<string, unknown>, loaded);

      console.log(formatConfigOutput(runtime, format));
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('[agent-lens] error:', err.message);
  process.exit(1);
});
