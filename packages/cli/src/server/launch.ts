import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { ResolvedRuntimeConfig } from '../types.js';

const require = createRequire(import.meta.url);
export const serverEntry = require.resolve('@agent-lens/server');
const uiPackageJson = require.resolve('@agent-lens/ui/package.json');
export const uiDist = path.join(path.dirname(uiPackageJson), 'dist');

export function openBrowser(url: string) {
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

export function launchServer(runtime: ResolvedRuntimeConfig, loadedPath: string | null) {
  const port = String(runtime.port);

  if (!fs.existsSync(serverEntry)) {
    console.error(`[agent-lens] server entry not found: ${serverEntry}`);
    process.exit(1);
  }

  if (!fs.existsSync(uiDist)) {
    console.error(`[agent-lens] UI dist not found: ${uiDist}`);
    process.exit(1);
  }

  const configHint = loadedPath ? ` (config: ${path.basename(loadedPath)})` : '';
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
}
