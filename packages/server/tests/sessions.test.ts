import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { extractSessionFields, extractSessionKey } from '../src/lib/session-extract.js';

type TestRuntime = ReturnType<typeof createApp> & { cleanup: () => void };

function createTestRuntime(): TestRuntime {
  const dir = mkdtempSync(join(tmpdir(), 'agent-lens-sessions-test-'));
  const dbFile = join(dir, 'test.db');
  const runtime = createApp(dbFile);

  return {
    ...runtime,
    cleanup: () => {
      runtime.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function insertSpan(runtime: TestRuntime, row: {
  received_at: string;
  trace_id: string;
  span_id: string;
  name: string;
  start: string;
  end: string;
  attributes?: Record<string, unknown>;
  resource_attributes?: Record<string, unknown>;
}) {
  runtime.db
    .prepare(
      `INSERT INTO spans (
        received_at, trace_id, span_id, parent_span_id, name, kind,
        start_time_unix_nano, end_time_unix_nano, duration_ns,
        attributes, status_code, status, resource_attributes, events, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.received_at,
      row.trace_id,
      row.span_id,
      null,
      row.name,
      1,
      row.start,
      row.end,
      Number(row.end) - Number(row.start),
      JSON.stringify(row.attributes ?? {}),
      0,
      null,
      JSON.stringify(row.resource_attributes ?? {}),
      null,
      '{}'
    );
}

test('extractSessionKey fallback order and invalid JSON handling', () => {
  assert.equal(extractSessionKey('{', null), null);

  assert.equal(
    extractSessionKey(
      JSON.stringify({ 'openclaw.sessionKey': 'sk-1', 'openclaw.sessionId': 'sid-1' }),
      JSON.stringify({ 'openclaw.sessionKey': 'sk-r' })
    ),
    'sk-1'
  );

  assert.equal(
    extractSessionKey(JSON.stringify({ 'openclaw.sessionId': 'sid-2' }), JSON.stringify({ 'openclaw.sessionKey': 'sk-r' })),
    'sid-2'
  );

  assert.equal(extractSessionKey('{}', JSON.stringify({ 'openclaw.sessionKey': 'sk-r2' })), 'sk-r2');
  assert.equal(extractSessionKey('{}', JSON.stringify({ 'openclaw.sessionId': 'sid-r2' })), 'sid-r2');
});

test('extractSessionFields extracts channel/state/outcome aliases', () => {
  const fields = extractSessionFields(
    JSON.stringify({
      'openclaw.sessionKey': 'session-a',
      channel: 'telegram',
      state: 'ok',
      'openclaw.outcome': 'success'
    }),
    '{}'
  );

  assert.equal(fields.sessionKey, 'session-a');
  assert.equal(fields.channel, 'telegram');
  assert.equal(fields.state, 'ok');
  assert.equal(fields.outcome, 'success');
});

test('sessions overview and timeline endpoints contract', async () => {
  const runtime = createTestRuntime();
  try {
    insertSpan(runtime, {
      received_at: '2026-02-26T01:00:00.000Z',
      trace_id: 't-1',
      span_id: 's-1',
      name: 'openclaw.message.processed',
      start: '100',
      end: '180',
      attributes: { 'openclaw.sessionKey': 'sess-a', channel: 'telegram', state: 'ok', outcome: 'success' },
      resource_attributes: { 'service.name': 'nyx' }
    });
    insertSpan(runtime, {
      received_at: '2026-02-26T01:00:01.000Z',
      trace_id: 't-2',
      span_id: 's-2',
      name: 'openclaw.agent.started',
      start: '200',
      end: '250',
      attributes: { 'openclaw.sessionId': 'sess-a' },
      resource_attributes: { 'service.name': 'nyx' }
    });
    insertSpan(runtime, {
      received_at: '2026-02-26T01:00:02.000Z',
      trace_id: 't-3',
      span_id: 's-3',
      name: 'openclaw.agent.finished',
      start: '90',
      end: '190',
      attributes: {},
      resource_attributes: { 'openclaw.sessionKey': 'sess-b', 'service.name': 'runa', channel: 'telegram' }
    });
    insertSpan(runtime, {
      received_at: '2026-02-26T01:00:03.000Z',
      trace_id: 't-4',
      span_id: 's-4',
      name: 'openclaw.no-session',
      start: '300',
      end: '310',
      attributes: {},
      resource_attributes: { 'service.name': 'orphan' }
    });

    const overviewRes = await runtime.app.request('http://localhost/api/sessions/overview?limit=500');
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.equal(overview.ok, true);
    assert.equal(overview.pagination.limit, 200);
    assert.equal(overview.pagination.total, 2);
    assert.equal(overview.meta.unmapped_span_count, 1);
    assert.equal(overview.items[0].session_key, 'sess-a');
    assert.deepEqual(overview.items[0].event_types, ['openclaw.agent.started', 'openclaw.message.processed']);

    const timelineRes = await runtime.app.request('http://localhost/api/sessions/sess-a/timeline?limit=5000');
    assert.equal(timelineRes.status, 200);
    const timeline = await timelineRes.json();
    assert.equal(timeline.ok, true);
    assert.equal(timeline.sessionKey, 'sess-a');
    assert.equal(timeline.pagination.limit, 1000);
    assert.equal(timeline.pagination.total, 2);
    assert.equal(timeline.items[0].start_time_unix_nano, 100);
    assert.equal(timeline.items[1].start_time_unix_nano, 200);
    assert.equal(timeline.items[0].service_name, 'nyx');
    assert.equal(timeline.items[0].channel, 'telegram');

    const filteredTimelineRes = await runtime.app.request(
      'http://localhost/api/sessions/sess-a/timeline?eventType=openclaw.agent.started'
    );
    const filteredTimeline = await filteredTimelineRes.json();
    assert.equal(filteredTimeline.pagination.total, 1);
    assert.equal(filteredTimeline.items[0].name, 'openclaw.agent.started');
  } finally {
    runtime.cleanup();
  }
});
