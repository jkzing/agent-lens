#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerStartCommand } from './commands/start.js';

async function main() {
  const program = new Command();

  program
    .name('agent-lens')
    .description('Zero-config local OTEL receiver and UI for AI agent observability');

  registerStartCommand(program);
  registerConfigCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('[agent-lens] error:', err.message);
  process.exit(1);
});
