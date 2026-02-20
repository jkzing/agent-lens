import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPackageRoot = path.resolve(import.meta.dirname, '..');
const cliEntry = path.join(cliPackageRoot, 'dist', 'index.js');

before(() => {
  if (fs.existsSync(cliEntry)) {
    return;
  }

  const build = spawnSync('pnpm', ['run', 'build'], {
    cwd: cliPackageRoot,
    encoding: 'utf8'
  });

  assert.equal(build.status, 0, `build failed: ${build.stderr || build.stdout}`);
  assert.equal(fs.existsSync(cliEntry), true, `cli entry not found: ${cliEntry}`);
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: cliPackageRoot,
    encoding: 'utf8'
  });
}

test('smoke: config command path is wired and discoverable', () => {
  const result = runCli(['config', '--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: agent-lens config/);
  assert.match(result.stdout, /init/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /print/);
});

test('smoke: start command path is wired on root command', () => {
  const result = runCli(['--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: agent-lens/);
  assert.match(result.stdout, /--port <number>/);
  assert.match(result.stdout, /--data-dir <path>/);
  assert.match(result.stdout, /--config <path>/);
  assert.match(result.stdout, /--no-open/);
});
