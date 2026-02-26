import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';

type TestRuntime = ReturnType<typeof createApp> & { cleanup: () => void };

function createTestRuntime(): TestRuntime {
  const dir = mkdtempSync(join(tmpdir(), 'agent-lens-server-test-'));
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

test('GET /health returns basic service response', async () => {
  const runtime = createTestRuntime();
  try {
    const res = await runtime.app.request('http://localhost/health');
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.deepEqual(json, { ok: true, service: 'agent-lens-server' });
  } finally {
    runtime.cleanup();
  }
});

test('POST /v1/traces invalid JSON returns partialSuccess error', async () => {
  const runtime = createTestRuntime();
  try {
    const res = await runtime.app.request('http://localhost/v1/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, {
      partialSuccess: {
        rejectedSpans: 1,
        errorMessage: 'Invalid JSON payload'
      }
    });
  } finally {
    runtime.cleanup();
  }
});

test('POST /v1/traces empty and valid payload paths', async () => {
  const runtime = createTestRuntime();
  try {
    const emptyRes = await runtime.app.request('http://localhost/v1/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(emptyRes.status, 200);
    assert.deepEqual(await emptyRes.json(), {
      partialSuccess: {
        rejectedSpans: 0,
        errorMessage: 'No valid spans found in payload'
      }
    });

    const validPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'openclaw-agent' } }]
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '00112233445566778899aabbccddeeff',
                  spanId: '0011223344556677',
                  name: 'agent.request',
                  kind: 2,
                  startTimeUnixNano: '1739850000000000000',
                  endTimeUnixNano: '1739850000000100000',
                  attributes: [{ key: 'gen_ai.usage.input_tokens', value: { intValue: 12 } }]
                }
              ]
            }
          ]
        }
      ]
    };

    const okRes = await runtime.app.request('http://localhost/v1/traces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validPayload)
    });

    assert.equal(okRes.status, 200);
    assert.deepEqual(await okRes.json(), {});
  } finally {
    runtime.cleanup();
  }
});

test('GET /api/traces returns expected structure', async () => {
  const runtime = createTestRuntime();
  try {
    runtime.db
      .prepare(
        `INSERT INTO spans (
          received_at, trace_id, span_id, parent_span_id, name, kind,
          start_time_unix_nano, end_time_unix_nano, duration_ns,
          attributes, status_code, status, resource_attributes, events, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        '2026-02-19T00:00:00.000Z',
        'trace-1',
        'span-1',
        null,
        'root',
        1,
        '100',
        '200',
        100,
        JSON.stringify({ 'gen_ai.usage.input_tokens': 4, 'gen_ai.usage.output_tokens': 6 }),
        0,
        null,
        JSON.stringify({ 'service.name': 'svc-a' }),
        null,
        '{}'
      );

    const res = await runtime.app.request('http://localhost/api/traces?limit=10&offset=0');
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.ok, true);
    assert.ok(Array.isArray(json.items));
    assert.equal(typeof json.pagination, 'object');
    assert.equal(json.pagination.limit, 10);
    assert.equal(json.pagination.offset, 0);
    assert.equal(json.pagination.total, 1);
    assert.equal(json.items[0].trace_id, 'trace-1');
  } finally {
    runtime.cleanup();
  }
});

test('POST /v1/metrics and /v1/logs success + summary endpoints', async () => {
  const runtime = createTestRuntime();
  try {
    const metricsPayload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'http.server.duration',
                  gauge: {
                    dataPoints: [{ asDouble: 12.3 }, { asDouble: 13.1 }]
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    const logsPayload = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [{ body: { stringValue: 'one' } }, { body: { stringValue: 'two' } }]
            }
          ]
        }
      ]
    };

    const metricsRes = await runtime.app.request('http://localhost/v1/metrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metricsPayload)
    });
    assert.equal(metricsRes.status, 200);
    assert.deepEqual(await metricsRes.json(), {});

    const logsRes = await runtime.app.request('http://localhost/v1/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(logsPayload)
    });
    assert.equal(logsRes.status, 200);
    assert.deepEqual(await logsRes.json(), {});

    const metricsSummaryRes = await runtime.app.request('http://localhost/api/metrics/ingest-summary');
    assert.equal(metricsSummaryRes.status, 200);
    const metricsSummary = await metricsSummaryRes.json();
    assert.equal(metricsSummary.ok, true);
    assert.equal(metricsSummary.signal, 'metrics');
    assert.equal(metricsSummary.total_records, 1);
    assert.equal(metricsSummary.parse_error_count, 0);
    assert.equal(metricsSummary.recent_records[0].item_count, 2);

    const logsSummaryRes = await runtime.app.request('http://localhost/api/logs/ingest-summary');
    assert.equal(logsSummaryRes.status, 200);
    const logsSummary = await logsSummaryRes.json();
    assert.equal(logsSummary.ok, true);
    assert.equal(logsSummary.signal, 'logs');
    assert.equal(logsSummary.total_records, 1);
    assert.equal(logsSummary.parse_error_count, 0);
    assert.equal(logsSummary.recent_records[0].item_count, 2);
  } finally {
    runtime.cleanup();
  }
});

test('POST /v1/metrics and /v1/logs invalid JSON returns partialSuccess', async () => {
  const runtime = createTestRuntime();
  try {
    const metricsRes = await runtime.app.request('http://localhost/v1/metrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    assert.equal(metricsRes.status, 200);
    assert.deepEqual(await metricsRes.json(), {
      partialSuccess: {
        rejectedDataPoints: 1,
        errorMessage: 'Invalid JSON payload'
      }
    });

    const logsRes = await runtime.app.request('http://localhost/v1/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
    assert.equal(logsRes.status, 200);
    assert.deepEqual(await logsRes.json(), {
      partialSuccess: {
        rejectedLogRecords: 1,
        errorMessage: 'Invalid JSON payload'
      }
    });

    const metricsSummaryRes = await runtime.app.request('http://localhost/api/metrics/ingest-summary');
    const metricsSummary = await metricsSummaryRes.json();
    assert.equal(metricsSummary.total_records, 1);
    assert.equal(metricsSummary.parse_error_count, 1);

    const logsSummaryRes = await runtime.app.request('http://localhost/api/logs/ingest-summary');
    const logsSummary = await logsSummaryRes.json();
    assert.equal(logsSummary.total_records, 1);
    assert.equal(logsSummary.parse_error_count, 1);
  } finally {
    runtime.cleanup();
  }
});

test('GET /api/traces/:traceId and /export?format=csv basic contract', async () => {
  const runtime = createTestRuntime();
  try {
    const insert = runtime.db.prepare(
      `INSERT INTO spans (
        received_at, trace_id, span_id, parent_span_id, name, kind,
        start_time_unix_nano, end_time_unix_nano, duration_ns,
        attributes, status_code, status, resource_attributes, events, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insert.run(
      '2026-02-19T00:00:00.000Z',
      'trace-contract',
      'root-span',
      null,
      'root',
      1,
      '100',
      '300',
      200,
      '{}',
      0,
      null,
      '{}',
      null,
      '{}'
    );

    insert.run(
      '2026-02-19T00:00:00.001Z',
      'trace-contract',
      'child-span',
      'root-span',
      'child',
      1,
      '150',
      '250',
      100,
      '{}',
      0,
      null,
      '{}',
      null,
      '{}'
    );

    const detailRes = await runtime.app.request('http://localhost/api/traces/trace-contract?limit=10&offset=0');
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.ok, true);
    assert.equal(detailJson.traceId, 'trace-contract');
    assert.equal(detailJson.pagination.total, 2);
    assert.equal(detailJson.items.length, 2);

    const csvRes = await runtime.app.request('http://localhost/api/traces/trace-contract/export?format=csv');
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get('content-type') || '', /text\/csv/);
    assert.match(csvRes.headers.get('content-disposition') || '', /trace-trace-contract\.csv/);
    const csvText = await csvRes.text();
    assert.match(csvText, /trace_id,span_id,parent_span_id,name,start,end,duration,status_code/);
    assert.match(csvText, /trace-contract,root-span/);
  } finally {
    runtime.cleanup();
  }
});
