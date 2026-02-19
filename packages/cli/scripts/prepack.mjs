#!/usr/bin/env node
// prepack.mjs — runs before `npm publish` / `npm pack`
// 1. builds all workspace packages
// 2. copies root README.md → cli/README.md

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

const readmeSrc = path.join(repoRoot, 'README.md');
const readmeDest = path.join(cliRoot, 'README.md');
if (fs.existsSync(readmeSrc)) {
  log('copying README.md');
  fs.copyFileSync(readmeSrc, readmeDest);
}

log('done ✓');
