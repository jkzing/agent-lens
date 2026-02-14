#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';

const program = new Command();

program
  .name('agent-lens')
  .description('Run agent-lens local dev stack')
  .action(() => {
    console.log('[agent-lens/cli] starting server + ui...');

    const server = spawn('pnpm', ['--filter', '@agent-lens/server', 'dev'], {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    const ui = spawn('pnpm', ['--filter', '@agent-lens/ui', 'dev'], {
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    const shutdown = () => {
      server.kill('SIGINT');
      ui.kill('SIGINT');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.on('exit', (code) => {
      if (code && code !== 0) {
        console.error(`[agent-lens/cli] server exited with ${code}`);
      }
    });

    ui.on('exit', (code) => {
      if (code && code !== 0) {
        console.error(`[agent-lens/cli] ui exited with ${code}`);
      }
    });
  });

program.parse(process.argv);
