#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as TOML from '@iarna/toml';

type LensConfig = {
  server?: {
    port?: number;
    dataDir?: string;
  };
  ui?: {
    open?: boolean;
  };
};

type RuntimeOptions = {
  port: number;
  dataDir: string;
  open: boolean;
};

const require = createRequire(import.meta.url);
const serverEntry = require.resolve('@agent-lens/server');
const uiPackageJson = require.resolve('@agent-lens/ui/package.json');
const uiDist = path.join(path.dirname(uiPackageJson), 'dist');

const DEFAULTS = {
  port: 4318,
  open: true,
  dataDir: path.resolve(process.cwd(), 'data')
} as const;

const CONFIG_TEMPLATE = `# agent-lens configuration (v1)\n# Save as agent-lens.toml\n\n[server]\n# Local server port\nport = 4318\n\n# Data directory for SQLite storage\ndataDir = "./data"\n\n[ui]\n# Auto-open browser on startup\nopen = true\n`;

function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true });
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true });
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true });
}

function discoverConfigPath(cwd: string): string | null {
  const tomlPath = path.resolve(cwd, 'agent-lens.toml');
  if (fs.existsSync(tomlPath)) return tomlPath;

  const jsonPath = path.resolve(cwd, 'agent-lens.json');
  if (fs.existsSync(jsonPath)) return jsonPath;

  return null;
}

function parseConfigFile(configPath: string): unknown {
  const content = fs.readFileSync(configPath, 'utf8');
  if (configPath.endsWith('.toml')) {
    return TOML.parse(content);
  }
  if (configPath.endsWith('.json')) {
    return JSON.parse(content);
  }
  throw new Error(`Unsupported config format: ${configPath}`);
}

function validateConfig(config: unknown, source = 'config'): { config: LensConfig; errors: string[] } {
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

function loadConfig(explicitPath?: string): { path: string | null; config: LensConfig } {
  const configPath = explicitPath ? path.resolve(process.cwd(), explicitPath) : discoverConfigPath(process.cwd());
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

function buildRuntimeOptions(program: Command, opts: Record<string, unknown>, config: LensConfig): RuntimeOptions {
  const portSource = program.getOptionValueSource('port');
  const dataDirSource = program.getOptionValueSource('dataDir');
  const openSource = program.getOptionValueSource('open');

  const resolvedPort =
    portSource === 'cli'
      ? Number(opts.port)
      : config.server?.port ?? DEFAULTS.port;

  const resolvedDataDir =
    dataDirSource === 'cli'
      ? String(opts.dataDir)
      : config.server?.dataDir ?? DEFAULTS.dataDir;

  const resolvedOpen =
    openSource === 'cli'
      ? opts.open !== false
      : config.ui?.open ?? DEFAULTS.open;

  if (!Number.isFinite(resolvedPort) || resolvedPort <= 0) {
    throw new Error(`Invalid port: ${String(resolvedPort)}`);
  }

  return {
    port: Math.trunc(resolvedPort),
    dataDir: path.resolve(process.cwd(), resolvedDataDir),
    open: resolvedOpen
  };
}

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
      const runtime = buildRuntimeOptions(program, opts as Record<string, unknown>, loaded.config);
      const port = String(runtime.port);

      if (!fs.existsSync(serverEntry)) {
        console.error(`[agent-lens] server entry not found: ${serverEntry}`);
        process.exit(1);
      }

      if (!fs.existsSync(uiDist)) {
        console.error(`[agent-lens] UI dist not found: ${uiDist}`);
        process.exit(1);
      }

      const configHint = loaded.path ? ` (config: ${path.basename(loaded.path)})` : '';
      console.log(`[agent-lens] starting on http://localhost:${port}${configHint}`);

      const server = spawn(process.execPath, [serverEntry], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: port,
          DATA_DIR: runtime.dataDir,
          UI_DIST: uiDist,
        },
      });

      const url = `http://localhost:${port}`;
      if (runtime.open) {
        setTimeout(() => openBrowser(url), 800);
      }

      const shutdown = () => {
        server.kill('SIGINT');
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      server.on('exit', (code) => {
        process.exit(code ?? 0);
      });
    });

  const configCmd = program.command('config').description('manage agent-lens config file');

  configCmd
    .command('init')
    .description('create agent-lens.toml in current directory')
    .action(() => {
      const filePath = path.resolve(process.cwd(), 'agent-lens.toml');
      if (fs.existsSync(filePath)) {
        console.error(`[agent-lens] config already exists: ${filePath}`);
        process.exit(1);
      }

      fs.writeFileSync(filePath, CONFIG_TEMPLATE, 'utf8');
      console.log(`[agent-lens] created ${filePath}`);
    });

  configCmd
    .command('validate')
    .description('validate config file')
    .option('--config <path>', 'path to config file (default: auto-discovery)')
    .action((opts) => {
      const explicit = typeof opts.config === 'string' ? opts.config : undefined;
      const configPath = explicit ? path.resolve(process.cwd(), explicit) : discoverConfigPath(process.cwd());

      if (!configPath) {
        console.error('[agent-lens] no config file found (expected agent-lens.toml or agent-lens.json)');
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

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('[agent-lens] error:', err.message);
  process.exit(1);
});
