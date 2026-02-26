import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenClawPluginConfig } from '../src/config.js';

test('parseOpenClawPluginConfig returns defaults for invalid input', () => {
  const config = parseOpenClawPluginConfig(null);

  assert.deepEqual(config, {
    enabled: true,
    sampleRate: 1,
    includeTools: []
  });
});

test('parseOpenClawPluginConfig normalizes invalid values', () => {
  const config = parseOpenClawPluginConfig({
    enabled: false,
    sampleRate: 2,
    includeTools: ['web_search', 123, 'exec']
  });

  assert.deepEqual(config, {
    enabled: false,
    sampleRate: 1,
    includeTools: ['web_search', 'exec']
  });
});
