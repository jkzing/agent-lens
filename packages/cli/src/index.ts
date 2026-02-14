#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...options.env }
    });

    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

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
    .description('Run agent-lens (build UI + serve API/UI)')
    .option('-p, --port <number>', 'server port', '4318')
    .option('--no-open', 'disable auto-open browser')
    .action(async (opts) => {
      const port = String(opts.port || '4318');
      const uiDist = path.join(repoRoot, 'packages/ui/dist');

      console.log('[agent-lens/cli] building ui...');
      await run('pnpm', ['--filter', '@agent-lens/ui', 'build']);

      console.log('[agent-lens/cli] building server...');
      await run('pnpm', ['--filter', '@agent-lens/server', 'build']);

      console.log('[agent-lens/cli] starting server...');
      const server = spawn('pnpm', ['--filter', '@agent-lens/server', 'start'], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          PORT: port,
          UI_DIST: uiDist
        }
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
  console.error('[agent-lens/cli] failed:', err.message);
  process.exit(1);
});
