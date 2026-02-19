import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as TOML from '@iarna/toml';

const cliPackageRoot = path.resolve(import.meta.dirname, '..');
const cliEntry = path.join(cliPackageRoot, 'dist', 'index.js');

before(() => {
  const build = spawnSync('pnpm', ['run', 'build'], {
    cwd: cliPackageRoot,
    encoding: 'utf8'
  });

  assert.equal(build.status, 0, `build failed: ${build.stderr || build.stdout}`);
  assert.equal(fs.existsSync(cliEntry), true, `cli entry not found: ${cliEntry}`);
});

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lens-cli-test-'));
}

function runCli(args: string[], home: string) {
  return spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: cliPackageRoot,
    env: {
      ...process.env,
      HOME: home
    },
    encoding: 'utf8'
  });
}

test('agent-lens config init creates default config under ~/.agent-lens/config.toml', () => {
  const home = makeHome();
  const result = runCli(['config', 'init'], home);
  const configPath = path.join(home, '.agent-lens', 'config.toml');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(configPath), true);
});

test('agent-lens config validate exits ok for valid config', () => {
  const home = makeHome();
  const configDir = path.join(home, '.agent-lens');
  const configPath = path.join(configDir, 'config.toml');

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, '[server]\nport = 4318\n', 'utf8');

  const result = runCli(['config', 'validate'], home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /config is valid/);
});

test('agent-lens config print supports --format json|toml', () => {
  const home = makeHome();

  const jsonResult = runCli(['config', 'print', '--format', 'json'], home);
  assert.equal(jsonResult.status, 0, jsonResult.stderr);
  const jsonPayload = JSON.parse(jsonResult.stdout) as Record<string, unknown>;
  assert.equal(typeof jsonPayload.port, 'number');
  assert.equal(typeof jsonPayload.dataDir, 'string');
  assert.equal(typeof jsonPayload.open, 'boolean');
  assert.equal(typeof jsonPayload.sources, 'object');

  const tomlResult = runCli(['config', 'print', '--format', 'toml'], home);
  assert.equal(tomlResult.status, 0, tomlResult.stderr);
  const tomlPayload = TOML.parse(tomlResult.stdout) as Record<string, unknown>;
  assert.equal(typeof tomlPayload.port, 'number');
  assert.equal(typeof tomlPayload.dataDir, 'string');
  assert.equal(typeof tomlPayload.open, 'boolean');
  assert.equal(typeof tomlPayload.sources, 'object');
});

test('agent-lens config print shows CLI override precedence over config values', () => {
  const home = makeHome();
  const configDir = path.join(home, '.agent-lens');
  const configPath = path.join(configDir, 'config.toml');

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      '[server]',
      'port = 9000',
      'dataDir = "./from-config"',
      '',
      '[ui]',
      'open = true',
      ''
    ].join('\n'),
    'utf8'
  );

  const result = runCli(['config', 'print', '--port', '7777', '--data-dir', './from-cli', '--no-open'], home);
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(result.stdout) as {
    port: number;
    dataDir: string;
    open: boolean;
    sources: { port: string; dataDir: string; open: string };
  };

  assert.equal(payload.port, 7777);
  assert.match(payload.dataDir, /from-cli$/);
  assert.equal(payload.open, false);
  assert.deepEqual(payload.sources, {
    port: 'cli',
    dataDir: 'cli',
    open: 'cli'
  });
});

test('agent-lens config validate shows unknown-key warnings but exits success', () => {
  const home = makeHome();
  const configDir = path.join(home, '.agent-lens');
  const configPath = path.join(configDir, 'config.toml');

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    [
      'extraTopLevel = 1',
      '',
      '[server]',
      'port = 4318',
      'extraServer = "x"',
      '',
      '[ui]',
      'open = true',
      'extraUi = false',
      ''
    ].join('\n'),
    'utf8'
  );

  const result = runCli(['config', 'validate'], home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /config warnings/);
  assert.match(result.stderr, /extraTopLevel is unknown and will be ignored/);
  assert.match(result.stderr, /server\.extraServer is unknown and will be ignored/);
  assert.match(result.stderr, /ui\.extraUi is unknown and will be ignored/);
  assert.match(result.stdout, /config is valid/);
});

test('agent-lens config print shows unknown-key warnings to stderr', () => {
  const home = makeHome();
  const configDir = path.join(home, '.agent-lens');
  const configPath = path.join(configDir, 'config.toml');

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, '[server]\nport = 4318\nextraServer = "x"\n', 'utf8');

  const result = runCli(['config', 'print'], home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /config warnings/);
  assert.match(result.stderr, /server\.extraServer is unknown and will be ignored/);
  const payload = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(payload.port, 4318);
});
