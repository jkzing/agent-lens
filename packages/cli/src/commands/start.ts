import type { Command } from 'commander';
import { loadConfig } from '../config/load.js';
import { resolveRuntimeConfig } from '../runtime/resolve.js';
import { launchServer } from '../server/launch.js';

export function registerStartCommand(program: Command): void {
  program
    .option('-p, --port <number>', 'server port')
    .option('--data-dir <path>', 'data directory path')
    .option('--config <path>', 'path to config file (TOML/JSON)')
    .option('--no-open', 'disable auto-open browser')
    .action(async (opts) => {
      const loaded = loadConfig(typeof opts.config === 'string' ? opts.config : undefined);
      const runtime = resolveRuntimeConfig(program, opts as Record<string, unknown>, loaded);
      launchServer(runtime, loaded.path);
    });
}
