import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenClawPlugin, TOOL_CALL_SPAN_NAME, type ToolCallSpanEvent } from '../src/index.js';

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

test('emits tool span on success lifecycle', async () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    includeTools: ['web_search'],
    emitSpan: (event: ToolCallSpanEvent) => {
      events.push(event);
    }
  });

  plugin.before_tool_call({
    toolName: 'web_search',
    sessionKey: 'sess-1',
    callKey: 'call-1'
  });

  await new Promise((resolve) => setTimeout(resolve, 1));

  plugin.tool_result_persist({
    toolName: 'web_search',
    sessionKey: 'sess-1',
    callKey: 'call-1',
    success: true
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].name, TOOL_CALL_SPAN_NAME);
  assert.equal(events[1].name, TOOL_CALL_SPAN_NAME);
  assert.equal(events[1].attributes.toolName, 'web_search');
  assert.equal(events[1].attributes.sessionKey, 'sess-1');
  assert.equal(events[1].attributes.status, 'success');
  assert.equal(typeof events[1].attributes.durationMs, 'number');
  assert.ok(events[1].attributes.durationMs >= 0);
  assert.equal(events[1].attributes.error, undefined);
});

test('emits concise error on failed tool result', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    emitSpan: (event: ToolCallSpanEvent) => {
      events.push(event);
    }
  });

  plugin.before_tool_call({
    toolName: 'exec',
    sessionKey: 'sess-err'
  });

  plugin.tool_result_persist({
    toolName: 'exec',
    sessionKey: 'sess-err',
    success: false,
    error: new Error('tool exploded')
  });

  const errorEvent = events[1];
  assert.equal(errorEvent.attributes.status, 'error');
  assert.equal(errorEvent.attributes.error, 'tool exploded');
  assert.equal(errorEvent.attributes.toolName, 'exec');
});

test('handles missing optional context without throwing', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    emitSpan: (event: ToolCallSpanEvent) => {
      events.push(event);
    }
  });

  assert.doesNotThrow(() => {
    plugin.before_tool_call({ toolName: 'web_search' });
    plugin.tool_result_persist({ toolName: 'web_search', success: true });
  });

  assert.equal(events.length, 2);
  assert.equal(events[1].attributes.sessionKey, undefined);
  assert.equal(events[1].attributes.durationMs, 0);
});
