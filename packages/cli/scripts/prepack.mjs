#!/usr/bin/env node
// prepack.mjs — runs before `npm publish` / `npm pack`
// 1. builds all workspace packages
// 2. copies server/dist → cli/server-dist
// 3. copies ui/dist    → cli/ui-dist
// 4. copies root README.md → cli/README.md

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '../../..');

function log(msg) {
  console.log(`[prepack] ${msg}`);
}

log('building all packages...');
execSync('pnpm -r build', { cwd: repoRoot, stdio: 'inherit' });

for (const [src, dest] of [
  [path.join(repoRoot, 'packages/server/dist'), path.join(cliRoot, 'server-dist')],
  [path.join(repoRoot, 'packages/ui/dist'),     path.join(cliRoot, 'ui-dist')],
]) {
  log(`copying ${path.relative(repoRoot, src)} → ${path.relative(repoRoot, dest)}`);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

const readmeSrc  = path.join(repoRoot, 'README.md');
const readmeDest = path.join(cliRoot, 'README.md');
if (fs.existsSync(readmeSrc)) {
  log('copying README.md');
  fs.copyFileSync(readmeSrc, readmeDest);
}

log('done ✓');
