import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDbClient } from '../src/db/client.js';
import { backfillDerivedSpanColumns, bootstrapSchema } from '../src/db/schema.js';
import { listSpansPage } from '../src/repositories/spansRepo.js';
import { countTraceSpans, countTraces, listTraceSpansForExport, listTraceSpansPage, listTracesPageBase } from '../src/repositories/tracesRepo.js';

function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-lens-repositories-test-'));
  const dbFile = join(dir, 'test.db');
  const db = createDbClient(dbFile);
  bootstrapSchema(db);
  return {
    db,
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function createInsertSpan(db: ReturnType<typeof createDbClient>) {
  return db.prepare(`
    INSERT INTO spans (
      received_at,
      trace_id,
      span_id,
      parent_span_id,
      name,
      kind,
      start_time_unix_nano,
      end_time_unix_nano,
      duration_ns,
      attributes,
      status_code,
      status,
      resource_attributes,
      events,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

test('tracesRepo list contract: listTracesPageBase + countTraces', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run('2026-02-19T00:00:00.000Z', 'trace-a', 'a-root', null, 'root-a', 1, '10', '20', 10, '{}', 0, null, '{}', null, '{}');
    insert.run('2026-02-19T00:00:01.000Z', 'trace-b', 'b-root', null, 'root-b', 1, '30', '60', 30, '{}', 0, null, '{}', null, '{}');

    const rows = listTracesPageBase(runtime.db, 10, 0) as Array<any>;
    const total = countTraces(runtime.db);

    assert.equal(rows.length, 2);
    assert.equal(Number(total.total), 2);
    assert.equal(typeof rows[0].trace_id, 'string');
    assert.ok(typeof rows[0].span_count === 'number' || typeof rows[0].span_count === 'bigint');
    assert.equal(typeof rows[0].root_span_name, 'string');
  } finally {
    runtime.cleanup();
  }
});

test('tracesRepo detail/depth query contract: listTraceSpansPage + countTraceSpans ordering', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run('2026-02-19T00:00:00.000Z', 'trace-detail', 'root', null, 'root', 1, '100', '300', 200, '{}', 0, null, '{}', null, '{}');
    insert.run('2026-02-19T00:00:00.001Z', 'trace-detail', 'child', 'root', 'child', 1, '150', '250', 100, '{}', 0, null, '{}', null, '{}');

    const rows = listTraceSpansPage(runtime.db, 'trace-detail', 10, 0) as Array<any>;
    const total = countTraceSpans(runtime.db, 'trace-detail');

    assert.equal(rows.length, 2);
    assert.equal(Number(total.total), 2);
    assert.equal(rows[0].span_id, 'root');
    assert.equal(rows[1].parent_span_id, 'root');
  } finally {
    runtime.cleanup();
  }
});

test('spansRepo pagination query contract: listSpansPage', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run('2026-02-19T00:00:00.000Z', 'trace-s', 's1', null, 'one', 1, '10', '20', 10, '{}', 0, null, '{}', null, '{}');
    insert.run('2026-02-19T00:00:00.001Z', 'trace-s', 's2', null, 'two', 1, '20', '30', 10, '{}', 0, null, '{}', null, '{}');

    const page1 = listSpansPage(runtime.db, 1, 0) as Array<any>;
    const page2 = listSpansPage(runtime.db, 1, 1) as Array<any>;

    assert.equal(page1.length, 1);
    assert.equal(page2.length, 1);
    assert.notEqual(page1[0].id, page2[0].id);
  } finally {
    runtime.cleanup();
  }
});

test('schema creates session-query hardening indexes', () => {
  const runtime = createTestDb();
  try {
    const indexRows = runtime.db.prepare("PRAGMA index_list('spans')").all() as Array<{ name: string }>;
    const indexNames = new Set(indexRows.map((row) => row.name));

    assert.ok(indexNames.has('idx_spans_session_key_start'));
    assert.ok(indexNames.has('idx_spans_channel'));
    assert.ok(indexNames.has('idx_spans_event_type_start_time'));
    assert.ok(indexNames.has('idx_spans_session_key_start_expr'));
    assert.ok(indexNames.has('idx_spans_channel_expr'));
    assert.ok(indexNames.has('idx_spans_name_start_time'));
  } finally {
    runtime.cleanup();
  }
});

test('backfillDerivedSpanColumns backfills bounded rows', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run(
      '2026-02-19T00:00:00.000Z',
      'trace-backfill',
      'span-1',
      null,
      'openclaw.agent.finished',
      1,
      '10',
      '20',
      10,
      JSON.stringify({ 'openclaw.sessionKey': 'sess-1', channel: 'telegram', state: 'ok', outcome: 'success' }),
      0,
      null,
      '{}',
      null,
      '{}'
    );

    const updated = backfillDerivedSpanColumns(runtime.db, 1);
    assert.equal(updated, 1);

    const row = runtime.db
      .prepare('SELECT event_type, session_key, channel, state, outcome FROM spans WHERE trace_id = ?')
      .get('trace-backfill') as {
      event_type: string | null;
      session_key: string | null;
      channel: string | null;
      state: string | null;
      outcome: string | null;
    };

    assert.equal(row.event_type, 'openclaw.agent.finished');
    assert.equal(row.session_key, 'sess-1');
    assert.equal(row.channel, 'telegram');
    assert.equal(row.state, 'ok');
    assert.equal(row.outcome, 'success');
  } finally {
    runtime.cleanup();
  }
});

test('tracesRepo csv export data shape baseline: listTraceSpansForExport', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run('2026-02-19T00:00:00.000Z', 'trace-csv', 'root-span', null, 'root', 1, '100', '200', 100, '{}', 0, null, '{}', null, '{}');

    const rows = listTraceSpansForExport(runtime.db, 'trace-csv') as Array<any>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trace_id, 'trace-csv');
    assert.equal(rows[0].span_id, 'root-span');
    assert.ok(Object.hasOwn(rows[0], 'status_code'));
    assert.ok(Object.hasOwn(rows[0], 'duration_ns'));
  } finally {
    runtime.cleanup();
  }
});
