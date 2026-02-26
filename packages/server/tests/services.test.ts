import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDbClient } from '../src/db/client.js';
import { bootstrapSchema } from '../src/db/schema.js';
import {
  countLogRecords,
  countMetricDataPoints,
  decodeOtlpProtobufLogsRequest,
  decodeOtlpProtobufMetricsRequest,
  decodeOtlpProtobufTraceRequest,
  extractLogsPayloadSummary,
  extractMetricsPayloadSummary,
  extractSpans
} from '../src/otlp.js';
import { ingestTraceRequest } from '../src/services/ingest.js';
import { exportTrace, listTraces } from '../src/services/traces.js';

function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-lens-services-test-'));
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
      event_type,
      session_key,
      session_id,
      channel,
      state,
      outcome,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function createInsertMetricPayload(db: ReturnType<typeof createDbClient>) {
  return db.prepare(`
    INSERT INTO metric_payloads (
      received_at,
      content_type,
      payload,
      parse_status,
      parse_error,
      item_count,
      service_name,
      session_key,
      metric_names
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function createInsertLogPayload(db: ReturnType<typeof createDbClient>) {
  return db.prepare(`
    INSERT INTO log_payloads (
      received_at,
      content_type,
      payload,
      parse_status,
      parse_error,
      item_count,
      service_name,
      session_key,
      severity_text,
      severity_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

test('ingestTraceRequest handles invalid and valid JSON payload paths', async () => {
  const runtime = createTestDb();
  try {
    const insertSpan = createInsertSpan(runtime.db);
    const insertMetricPayload = createInsertMetricPayload(runtime.db);
    const insertLogPayload = createInsertLogPayload(runtime.db);

    const invalid = await ingestTraceRequest(
      'application/json',
      async () => {
        throw new Error('bad json');
      },
      async () => new ArrayBuffer(0),
      {
        db: runtime.db,
        insertSpan,
        insertMetricPayload,
        insertLogPayload,
        decodeOtlpProtobufTraceRequest,
        decodeOtlpProtobufMetricsRequest,
        decodeOtlpProtobufLogsRequest,
        extractSpans,
        countMetricDataPoints,
        countLogRecords
      }
    );
    assert.deepEqual(invalid, { rejectedSpans: 1, errorMessage: 'Invalid JSON payload' });

    const validPayload = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc-test' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '00112233445566778899aabbccddeeff',
                  spanId: '0011223344556677',
                  name: 'op',
                  kind: 1,
                  startTimeUnixNano: '100',
                  endTimeUnixNano: '200',
                  attributes: []
                }
              ]
            }
          ]
        }
      ]
    };

    const valid = await ingestTraceRequest(
      'application/json',
      async () => validPayload,
      async () => new ArrayBuffer(0),
      {
        db: runtime.db,
        insertSpan,
        insertMetricPayload,
        insertLogPayload,
        decodeOtlpProtobufTraceRequest,
        decodeOtlpProtobufMetricsRequest,
        decodeOtlpProtobufLogsRequest,
        extractSpans,
        countMetricDataPoints,
        countLogRecords
      }
    );

    assert.deepEqual(valid, { rejectedSpans: 0, errorMessage: '' });
    const row = runtime.db
      .prepare(
        'SELECT COUNT(*) as count, event_type, session_key, channel FROM spans WHERE trace_id = ? GROUP BY event_type, session_key, channel'
      )
      .get('00112233445566778899aabbccddeeff') as {
      count: number;
      event_type: string | null;
      session_key: string | null;
      channel: string | null;
    };
    assert.equal(Number(row.count), 1);
    assert.equal(row.event_type, 'op');
    assert.equal(row.session_key, null);
    assert.equal(row.channel, null);
  } finally {
    runtime.cleanup();
  }
});

test('listTraces returns pagination-safe shape and aggregated fields', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run(
      '2026-02-19T00:00:00.000Z',
      'trace-a',
      'span-a1',
      null,
      'root-a',
      1,
      '10',
      '20',
      10,
      JSON.stringify({ 'gen_ai.usage.input_tokens': 2, 'gen_ai.usage.output_tokens': 3 }),
      0,
      null,
      JSON.stringify({ 'service.name': 'svc-a' }),
      null,
      'root-a',
      null,
      null,
      null,
      null,
      null,
      '{}'
    );
    insert.run(
      '2026-02-19T00:00:01.000Z',
      'trace-b',
      'span-b1',
      null,
      'root-b',
      1,
      '30',
      '50',
      20,
      JSON.stringify({ 'gen_ai.usage.input_tokens': 5, 'gen_ai.usage.output_tokens': 7 }),
      0,
      null,
      JSON.stringify({ 'service.name': 'svc-b' }),
      null,
      'root-b',
      null,
      null,
      null,
      null,
      null,
      '{}'
    );

    const result = listTraces(runtime.db, 1, 0);
    assert.equal(Array.isArray(result.items), true);
    assert.equal(result.items.length, 1);
    assert.equal(Number(result.total), 2);
    assert.equal(typeof result.items[0].input_tokens, 'number');
    assert.equal(typeof result.items[0].output_tokens, 'number');
    assert.equal(Array.isArray(result.items[0].service_names), true);
    assert.equal(typeof result.items[0].primary_service_name, 'string');
  } finally {
    runtime.cleanup();
  }
});

test('exportTrace builds csv baseline content', () => {
  const runtime = createTestDb();
  try {
    const insert = createInsertSpan(runtime.db);
    insert.run(
      '2026-02-19T00:00:00.000Z',
      'trace-csv',
      'root-span',
      null,
      'root',
      1,
      '100',
      '200',
      100,
      '{}',
      0,
      null,
      '{}',
      null,
      'root',
      null,
      null,
      null,
      null,
      null,
      '{}'
    );

    const result = exportTrace(runtime.db, 'trace-csv', 'csv');
    assert.match(result.csv || '', /trace_id,span_id,parent_span_id,name,start,end,duration,status_code/);
    assert.match(result.csv || '', /trace-csv,root-span/);
  } finally {
    runtime.cleanup();
  }
});

test('extractMetricsPayloadSummary and extractLogsPayloadSummary derive query fields', () => {
  const metricsSummary = extractMetricsPayloadSummary({
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'svc-a' } },
            { key: 'openclaw.sessionKey', value: { stringValue: 'sess-a' } }
          ]
        },
        scopeMetrics: [
          {
            metrics: [
              { name: 'http.server.duration', gauge: { dataPoints: [{ asDouble: 1.2 }] } },
              { name: 'rpc.client.duration', sum: { dataPoints: [{ asInt: 2 }] } }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(metricsSummary.serviceName, 'svc-a');
  assert.equal(metricsSummary.sessionKey, 'sess-a');
  assert.deepEqual(metricsSummary.metricNames, ['http.server.duration', 'rpc.client.duration']);

  const logsSummary = extractLogsPayloadSummary({
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'svc-b' } }]
        },
        scopeLogs: [
          {
            logRecords: [
              { severityText: 'WARN', severityNumber: 13 },
              {
                severityText: 'ERROR',
                severityNumber: 17,
                attributes: [{ key: 'openclaw.sessionKey', value: { stringValue: 'sess-b' } }]
              }
            ]
          }
        ]
      }
    ]
  });

  assert.equal(logsSummary.serviceName, 'svc-b');
  assert.equal(logsSummary.sessionKey, 'sess-b');
  assert.equal(logsSummary.severityText, 'ERROR');
  assert.equal(logsSummary.severityNumber, 17);
});
