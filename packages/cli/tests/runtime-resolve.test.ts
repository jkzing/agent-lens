import test from 'node:test';
import assert from 'node:assert/strict';
import type { Command } from 'commander';
import { DEFAULTS } from '../src/config/load.js';
import { resolveRuntimeConfig } from '../src/runtime/resolve.js';

function fakeCommand(sources: Record<string, string>): Command {
  return {
    getOptionValueSource(option: string) {
      return sources[option] ?? 'default';
    }
  } as unknown as Command;
}

test('resolveRuntimeConfig uses defaults when no cli/config values exist', () => {
  const runtime = resolveRuntimeConfig(fakeCommand({}), {}, { path: null, config: {} });

  assert.equal(runtime.port, DEFAULTS.port);
  assert.equal(runtime.open, DEFAULTS.open);
  assert.equal(runtime.sources.port, 'default');
  assert.equal(runtime.sources.dataDir, 'default');
  assert.equal(runtime.sources.open, 'default');
});

test('resolveRuntimeConfig uses config values when cli not provided', () => {
  const runtime = resolveRuntimeConfig(
    fakeCommand({ port: 'default', dataDir: 'default', open: 'default' }),
    {},
    {
      path: '/tmp/config.toml',
      config: {
        server: { port: 9000, dataDir: './custom-data' },
        ui: { open: false }
      }
    }
  );

  assert.equal(runtime.port, 9000);
  assert.equal(runtime.open, false);
  assert.equal(runtime.sources.port, 'config');
  assert.equal(runtime.sources.dataDir, 'config');
  assert.equal(runtime.sources.open, 'config');
});

test('resolveRuntimeConfig prioritizes cli over config', () => {
  const runtime = resolveRuntimeConfig(
    fakeCommand({ port: 'cli', dataDir: 'cli', open: 'cli' }),
    { port: '7777', dataDir: './from-cli', open: false },
    {
      path: '/tmp/config.toml',
      config: {
        server: { port: 9000, dataDir: './from-config' },
        ui: { open: true }
      }
    }
  );

  assert.equal(runtime.port, 7777);
  assert.equal(runtime.open, false);
  assert.equal(runtime.sources.port, 'cli');
  assert.equal(runtime.sources.dataDir, 'cli');
  assert.equal(runtime.sources.open, 'cli');
});
