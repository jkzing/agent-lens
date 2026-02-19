import test from 'node:test';
import assert from 'node:assert/strict';
import { formatConfigOutput } from '../src/output/format.js';
import type { ResolvedRuntimeConfig } from '../src/types.js';

const runtime: ResolvedRuntimeConfig = {
  port: 4318,
  dataDir: '/tmp/data',
  open: true,
  configPath: null,
  sources: {
    port: 'default',
    dataDir: 'config',
    open: 'cli'
  }
};

test('formatConfigOutput renders json', () => {
  const out = formatConfigOutput(runtime, 'json');
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, runtime);
});

test('formatConfigOutput renders toml baseline', () => {
  const out = formatConfigOutput(runtime, 'toml');
  assert.match(out, /^port = 4_318/m);
  assert.match(out, /^dataDir = "\/tmp\/data"/m);
  assert.match(out, /^open = true/m);
  assert.match(out, /^configPath = "null"/m);
  assert.match(out, /^\[sources\]/m);
  assert.match(out, /^port = "default"/m);
  assert.match(out, /^dataDir = "config"/m);
  assert.match(out, /^open = "cli"/m);
});
