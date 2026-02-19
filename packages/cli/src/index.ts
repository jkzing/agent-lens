#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// After `npm install`:  dist/index.js  server-dist/index.js  ui-dist/
// Both server-dist and ui-dist are siblings of dist/ inside the CLI package.
const serverEntry = path.resolve(__dirname, '../server-dist/index.js');
const uiDist     = path.resolve(__dirname, '../ui-dist');

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

async function main() {
  const program = new Command();

  program
    .name('agent-lens')
    .description('Zero-config local OTEL receiver and UI for AI agent observability')
    .option('-p, --port <number>', 'server port', '4318')
    .option('--no-open', 'disable auto-open browser')
    .action(async (opts) => {
      const port = String(opts.port || '4318');

      if (!fs.existsSync(serverEntry)) {
        console.error(`[agent-lens] server not found at: ${serverEntry}`);
        console.error('[agent-lens] if running from source, run "pnpm prepack" first');
        process.exit(1);
      }

      console.log(`[agent-lens] starting on http://localhost:${port}`);

      const server = spawn(process.execPath, [serverEntry], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: port,
          UI_DIST: uiDist,
        },
      });

      const url = `http://localhost:${port}`;
      if (opts.open !== false) {
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

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('[agent-lens] error:', err.message);
  process.exit(1);
});
