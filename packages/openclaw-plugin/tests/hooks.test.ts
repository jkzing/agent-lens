import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenClawPlugin } from '../src/index.js';

test('hook invocation shape returns accepted/persisted booleans', () => {
  const plugin = createOpenClawPlugin({
    enabled: true,
    sampleRate: 1,
    includeTools: ['web_search']
  });

  const before = plugin.before_tool_call({ toolName: 'web_search' });
  const persisted = plugin.tool_result_persist({
    toolName: 'web_search',
    success: true,
    result: { ok: true }
  });

  assert.equal(typeof before.accepted, 'boolean');
  assert.equal(typeof persisted.persisted, 'boolean');
  assert.equal(before.accepted, true);
  assert.equal(persisted.persisted, true);
});
