import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config/load.js';

test('validateConfig returns error when root is invalid', () => {
  const result = validateConfig(null, 'config.toml');
  assert.deepEqual(result.config, {});
  assert.deepEqual(result.errors, ['config.toml must be an object']);
});

test('validateConfig normalizes valid values', () => {
  const result = validateConfig(
    {
      server: { port: 4318.9, dataDir: '/tmp/data' },
      ui: { open: false }
    },
    'config.toml'
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.config, {
    server: { port: 4318, dataDir: '/tmp/data' },
    ui: { open: false }
  });
});

test('validateConfig reports nested type errors', () => {
  const result = validateConfig(
    {
      server: { port: 'nope', dataDir: '' },
      ui: { open: 'yes' }
    },
    'config.json'
  );

  assert.deepEqual(result.errors, [
    'config.json.server.port must be a number',
    'config.json.server.dataDir must be a non-empty string',
    'config.json.ui.open must be a boolean'
  ]);
});
