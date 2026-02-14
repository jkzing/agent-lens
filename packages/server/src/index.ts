import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono } from 'hono';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

type ParsedSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number | null;
  startTimeUnixNano: string | null;
  endTimeUnixNano: string | null;
  durationNs: number | null;
};

const app = new Hono();
app.use('*', cors());

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'agent-lens.db');
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS spans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  trace_id TEXT,
  span_id TEXT,
  parent_span_id TEXT,
  name TEXT,
  kind INTEGER,
  start_time_unix_nano TEXT,
  end_time_unix_nano TEXT,
  duration_ns INTEGER,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spans_received_at ON spans(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
`);

const existingColumns = db
  .prepare("PRAGMA table_info(spans)")
  .all() as Array<{ name: string }>;
const columnSet = new Set(existingColumns.map((col) => col.name));

if (!columnSet.has('trace_id')) {
  db.exec('ALTER TABLE spans ADD COLUMN trace_id TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN span_id TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN parent_span_id TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN name TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN kind INTEGER');
  db.exec('ALTER TABLE spans ADD COLUMN start_time_unix_nano TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN end_time_unix_nano TEXT');
  db.exec('ALTER TABLE spans ADD COLUMN duration_ns INTEGER');
}

const insertSpan = db.prepare(`
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
    payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function parseDurationNs(start?: string | number, end?: string | number): number | null {
  if (start == null || end == null) return null;
  const startNs = BigInt(String(start));
  const endNs = BigInt(String(end));
  const diff = endNs - startNs;
  if (diff < 0n) return null;
  if (diff > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(diff);
}

function extractSpans(body: any): ParsedSpan[] {
  const output: ParsedSpan[] = [];
  const resourceSpans = Array.isArray(body?.resourceSpans) ? body.resourceSpans : [];

  for (const resourceSpan of resourceSpans) {
    const scopeSpans = Array.isArray(resourceSpan?.scopeSpans) ? resourceSpan.scopeSpans : [];

    for (const scopeSpan of scopeSpans) {
      const spans = Array.isArray(scopeSpan?.spans) ? scopeSpan.spans : [];

      for (const span of spans) {
        output.push({
          traceId: span?.traceId ?? '',
          spanId: span?.spanId ?? '',
          parentSpanId: span?.parentSpanId ?? null,
          name: span?.name ?? 'unknown',
          kind: typeof span?.kind === 'number' ? span.kind : null,
          startTimeUnixNano: span?.startTimeUnixNano ? String(span.startTimeUnixNano) : null,
          endTimeUnixNano: span?.endTimeUnixNano ? String(span.endTimeUnixNano) : null,
          durationNs: parseDurationNs(span?.startTimeUnixNano, span?.endTimeUnixNano)
        });
      }
    }
  }

  return output;
}

app.get('/health', (c) => c.json({ ok: true, service: 'agent-lens-server' }));

app.post('/v1/traces', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const receivedAt = new Date().toISOString();
  const parsedSpans = extractSpans(body);

  if (parsedSpans.length === 0) {
    insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, JSON.stringify(body));
    return c.json({ ok: true, inserted: 1, parsedSpans: 0 });
  }

  const tx = db.transaction((rows: ParsedSpan[]) => {
    for (const row of rows) {
      insertSpan.run(
        receivedAt,
        row.traceId || null,
        row.spanId || null,
        row.parentSpanId,
        row.name,
        row.kind,
        row.startTimeUnixNano,
        row.endTimeUnixNano,
        row.durationNs,
        JSON.stringify(body)
      );
    }
  });

  tx(parsedSpans);

  return c.json({ ok: true, inserted: parsedSpans.length, parsedSpans: parsedSpans.length });
});

app.get('/api/spans', (c) => {
  const limitParam = Number(c.req.query('limit') || 100);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 100;

  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns
       FROM spans
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit);

  return c.json({ ok: true, items: rows });
});

const port = Number(process.env.PORT || 4318);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[agent-lens/server] listening on http://localhost:${port}`);
  console.log(`[agent-lens/server] sqlite: ${dbPath}`);
});
