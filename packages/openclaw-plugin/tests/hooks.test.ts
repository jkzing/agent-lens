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

test('emits tool span on success lifecycle with backward-compatible core fields', async () => {
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

test('default config does not emit raw tool input/output bodies', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    emitSpan: (event: ToolCallSpanEvent) => events.push(event)
  });

  plugin.before_tool_call({
    toolName: 'exec',
    args: { command: 'cat /etc/passwd', token: 'secret-token' }
  });

  plugin.tool_result_persist({
    toolName: 'exec',
    success: true,
    result: { stdout: 'very sensitive output', path: '/tmp/out.txt' }
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].attributes.input, undefined);
  assert.equal(events[1].attributes.output, undefined);
});

test('strips sensitive allowlisted keys from telemetry payloads', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    emitSpan: (event: ToolCallSpanEvent) => events.push(event),
    inputFieldAllowlist: ['query', 'token', 'authorization', 'filePath'],
    outputFieldAllowlist: ['status', 'apiKey', 'password', 'path']
  });

  plugin.before_tool_call({
    toolName: 'web_search',
    args: {
      query: 'safe query',
      token: 'hidden',
      authorization: 'Bearer XXX',
      filePath: '/tmp/file'
    }
  });

  plugin.tool_result_persist({
    toolName: 'web_search',
    success: true,
    result: {
      status: 'ok',
      apiKey: 'nope',
      password: 'nope',
      path: '/tmp/nope'
    }
  });

  assert.deepEqual(events[0].attributes.input, { query: 'safe query' });
  assert.deepEqual(events[1].attributes.output, { status: 'ok' });
});

test('truncates long strings in allowlisted telemetry fields', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    maxStringLength: 12,
    inputFieldAllowlist: ['query'],
    outputFieldAllowlist: ['message'],
    emitSpan: (event: ToolCallSpanEvent) => events.push(event)
  });

  plugin.before_tool_call({
    toolName: 'web_search',
    args: { query: 'abcdefghijklmnopqrstuvwxyz' }
  });

  plugin.tool_result_persist({
    toolName: 'web_search',
    success: true,
    result: { message: 'abcdefghijklmnopqrstuvwxyz' }
  });

  assert.deepEqual(events[0].attributes.input, { query: 'abcdefghijkl…' });
  assert.deepEqual(events[1].attributes.output, { message: 'abcdefghijkl…' });
});

test('includeTools filter controls emission across lifecycle', () => {
  const events: ToolCallSpanEvent[] = [];
  const plugin = createOpenClawPlugin({
    enabled: true,
    includeTools: ['web_search'],
    emitSpan: (event: ToolCallSpanEvent) => events.push(event)
  });

  const before = plugin.before_tool_call({ toolName: 'exec' });
  const persisted = plugin.tool_result_persist({
    toolName: 'exec',
    success: true,
    result: { ok: true }
  });

  assert.equal(before.accepted, false);
  assert.equal(persisted.persisted, false);
  assert.equal(events.length, 0);
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
