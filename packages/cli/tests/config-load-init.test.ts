import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDefaultConfig } from '../src/config/init.js';
import { loadConfig, parseConfigFile } from '../src/config/load.js';

function withTempDir(fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-lens-cli-config-test-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parseConfigFile parses .toml and .json files', () => {
  withTempDir((dir) => {
    const tomlPath = path.join(dir, 'config.toml');
    const jsonPath = path.join(dir, 'config.json');

    fs.writeFileSync(tomlPath, '[server]\nport = 4318\n[ui]\nopen = true\n', 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify({ server: { port: 9000 }, ui: { open: false } }), 'utf8');

    assert.deepEqual(parseConfigFile(tomlPath), { server: { port: 4318 }, ui: { open: true } });
    assert.deepEqual(parseConfigFile(jsonPath), { server: { port: 9000 }, ui: { open: false } });
  });
});

test('parseConfigFile throws for unsupported extension', () => {
  withTempDir((dir) => {
    const yamlPath = path.join(dir, 'config.yaml');
    fs.writeFileSync(yamlPath, 'server:\n  port: 4318\n', 'utf8');

    assert.throws(() => parseConfigFile(yamlPath), /Unsupported config format/);
  });
});

test('loadConfig throws for explicit path when file does not exist', () => {
  withTempDir((dir) => {
    const oldCwd = process.cwd();
    process.chdir(dir);
    try {
      assert.throws(() => loadConfig('missing.toml'), /Config file not found:/);
    } finally {
      process.chdir(oldCwd);
    }
  });
});

test('loadConfig returns normalized config and warnings for unknown keys', () => {
  withTempDir((dir) => {
    const oldCwd = process.cwd();
    process.chdir(dir);
    try {
      const relPath = 'sample-config.toml';
      fs.writeFileSync(
        path.join(dir, relPath),
        [
          'extra = "ignored"',
          '[server]',
          'port = 4318.9',
          'dataDir = "./data"',
          'unknownServerKey = "x"',
          '[ui]',
          'open = false',
          'unknownUiKey = true'
        ].join('\n'),
        'utf8'
      );

      const result = loadConfig(relPath);

      assert.equal(fs.realpathSync(result.path || ''), fs.realpathSync(path.join(dir, relPath)));
      assert.deepEqual(result.config, {
        server: { port: 4318, dataDir: './data' },
        ui: { open: false }
      });
      assert.deepEqual(result.warnings, [
        'sample-config.toml.extra is unknown and will be ignored',
        'sample-config.toml.server.unknownServerKey is unknown and will be ignored',
        'sample-config.toml.ui.unknownUiKey is unknown and will be ignored'
      ]);
    } finally {
      process.chdir(oldCwd);
    }
  });
});

test('initDefaultConfig creates file and throws if file already exists', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'nested', 'config.toml');

    const created = initDefaultConfig(filePath);
    assert.equal(created.createdPath, filePath);
    assert.equal(fs.existsSync(filePath), true);

    const content = fs.readFileSync(filePath, 'utf8');
    assert.match(content, /\[server\]/);
    assert.match(content, /\[ui\]/);

    assert.throws(() => initDefaultConfig(filePath), /config already exists/);
  });
});
