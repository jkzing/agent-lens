import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenClawPluginConfig } from '../src/config.js';

test('parseOpenClawPluginConfig returns defaults for invalid input', () => {
  const config = parseOpenClawPluginConfig(null);

  assert.equal(config.enabled, true);
  assert.equal(config.sampleRate, 1);
  assert.deepEqual(config.includeTools, []);
  assert.equal(config.emitSpan, undefined);
});

test('parseOpenClawPluginConfig normalizes invalid values', () => {
  const config = parseOpenClawPluginConfig({
    enabled: false,
    sampleRate: 2,
    includeTools: ['web_search', 123, 'exec']
  });

  assert.equal(config.enabled, false);
  assert.equal(config.sampleRate, 1);
  assert.deepEqual(config.includeTools, ['web_search', 'exec']);
  assert.equal(config.emitSpan, undefined);
});
