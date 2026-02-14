import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
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
  attributes: string | null;
  statusCode: number | null;
  resourceAttributes: string | null;
  events: string | null;
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
  attributes TEXT,
  status_code INTEGER,
  resource_attributes TEXT,
  events TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spans_received_at ON spans(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
`);

const existingColumns = db
  .prepare('PRAGMA table_info(spans)')
  .all() as Array<{ name: string }>;
const columnSet = new Set(existingColumns.map((col) => col.name));

const ensureColumn = (name: string, type: string) => {
  if (!columnSet.has(name)) {
    db.exec(`ALTER TABLE spans ADD COLUMN ${name} ${type}`);
  }
};

ensureColumn('trace_id', 'TEXT');
ensureColumn('span_id', 'TEXT');
ensureColumn('parent_span_id', 'TEXT');
ensureColumn('name', 'TEXT');
ensureColumn('kind', 'INTEGER');
ensureColumn('start_time_unix_nano', 'TEXT');
ensureColumn('end_time_unix_nano', 'TEXT');
ensureColumn('duration_ns', 'INTEGER');
ensureColumn('attributes', 'TEXT');
ensureColumn('status_code', 'INTEGER');
ensureColumn('resource_attributes', 'TEXT');
ensureColumn('events', 'TEXT');

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
    attributes,
    status_code,
    resource_attributes,
    events,
    payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

function toAttributeValue(value: any): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('intValue' in value) return Number(value.intValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('boolValue' in value) return Boolean(value.boolValue);
  if ('bytesValue' in value) return String(value.bytesValue);
  if ('arrayValue' in value) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((item: any) => toAttributeValue(item));
  }
  if ('kvlistValue' in value) {
    const values = Array.isArray(value.kvlistValue?.values) ? value.kvlistValue.values : [];
    const result: Record<string, unknown> = {};
    for (const item of values) {
      if (!item?.key) continue;
      result[item.key] = toAttributeValue(item.value);
    }
    return result;
  }
  return value;
}

function parseAttributeList(attributes: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const items = Array.isArray(attributes) ? attributes : [];

  for (const item of items) {
    if (!item?.key) continue;
    result[item.key] = toAttributeValue(item.value);
  }

  return result;
}

function extractSpans(body: any): ParsedSpan[] {
  const output: ParsedSpan[] = [];
  const resourceSpans = Array.isArray(body?.resourceSpans) ? body.resourceSpans : [];

  for (const resourceSpan of resourceSpans) {
    const resourceAttrs = parseAttributeList(resourceSpan?.resource?.attributes);
    const scopeSpans = Array.isArray(resourceSpan?.scopeSpans) ? resourceSpan.scopeSpans : [];

    for (const scopeSpan of scopeSpans) {
      const spans = Array.isArray(scopeSpan?.spans) ? scopeSpan.spans : [];

      for (const span of spans) {
        const events = Array.isArray(span?.events) ? span.events : [];

        output.push({
          traceId: span?.traceId ?? '',
          spanId: span?.spanId ?? '',
          parentSpanId: span?.parentSpanId ? String(span.parentSpanId) : null,
          name: span?.name ?? 'unknown',
          kind: typeof span?.kind === 'number' ? span.kind : null,
          startTimeUnixNano: span?.startTimeUnixNano ? String(span.startTimeUnixNano) : null,
          endTimeUnixNano: span?.endTimeUnixNano ? String(span.endTimeUnixNano) : null,
          durationNs: parseDurationNs(span?.startTimeUnixNano, span?.endTimeUnixNano),
          attributes: JSON.stringify(parseAttributeList(span?.attributes)),
          statusCode: typeof span?.status?.code === 'number' ? span.status.code : null,
          resourceAttributes: JSON.stringify(resourceAttrs),
          events: events.length > 0 ? JSON.stringify(events) : null
        });
      }
    }
  }

  return output;
}

app.get('/health', (c) => c.json({ ok: true, service: 'agent-lens-server' }));

function otlpExportResponse(c: Context, rejectedSpans = 0, errorMessage = '') {
  if (rejectedSpans > 0 || errorMessage) {
    return c.json({
      partialSuccess: {
        rejectedSpans,
        errorMessage
      }
    });
  }

  return c.json({});
}

app.post('/v1/traces', async (c) => {
  const contentType = (c.req.header('content-type') || '').toLowerCase();
  const receivedAt = new Date().toISOString();

  if (contentType.includes('application/x-protobuf')) {
    const raw = Buffer.from(await c.req.arrayBuffer());
    const payload = JSON.stringify({
      contentType: 'application/x-protobuf',
      encoding: 'base64',
      body: raw.toString('base64')
    });

    insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, payload);
    return otlpExportResponse(c);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return otlpExportResponse(c, 1, 'Invalid JSON payload');
  }

  const payload = JSON.stringify(body);
  const parsedSpans = extractSpans(body);

  if (parsedSpans.length === 0) {
    insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, payload);
    return otlpExportResponse(c, 0, 'No valid spans found in payload');
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
        row.attributes,
        row.statusCode,
        row.resourceAttributes,
        row.events,
        payload
      );
    }
  });

  tx(parsedSpans);

  return otlpExportResponse(c);
});

function getPagination(c: Context) {
  const limitParam = Number(c.req.query('limit') || 100);
  const offsetParam = Number(c.req.query('offset') || 0);

  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 100;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

  return { limit, offset };
}

app.get('/api/spans', (c) => {
  const { limit, offset } = getPagination(c);

  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, resource_attributes, events
       FROM spans
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  return c.json({ ok: true, items: rows, pagination: { offset, limit } });
});

app.get('/api/traces', (c) => {
  const { limit, offset } = getPagination(c);

  const items = db
    .prepare(
      `WITH trace_base AS (
         SELECT
           trace_id,
           COUNT(*) AS span_count,
           MIN(CAST(start_time_unix_nano AS INTEGER)) AS start_ns,
           MAX(CAST(end_time_unix_nano AS INTEGER)) AS end_ns,
           MIN(received_at) AS first_received_at,
           MAX(received_at) AS last_received_at
         FROM spans
         WHERE trace_id IS NOT NULL AND trace_id != ''
         GROUP BY trace_id
       )
       SELECT
         tb.trace_id,
         tb.span_count,
         CASE
           WHEN tb.start_ns IS NOT NULL AND tb.end_ns IS NOT NULL AND tb.end_ns >= tb.start_ns THEN tb.end_ns - tb.start_ns
           ELSE NULL
         END AS duration_ns,
         COALESCE((
           SELECT s.name
           FROM spans s
           WHERE s.trace_id = tb.trace_id
             AND (s.parent_span_id IS NULL OR s.parent_span_id = '')
           ORDER BY CAST(s.start_time_unix_nano AS INTEGER) ASC, s.id ASC
           LIMIT 1
         ), '(unknown root)') AS root_span_name,
         tb.start_ns,
         tb.end_ns,
         tb.first_received_at,
         tb.last_received_at
       FROM trace_base tb
       ORDER BY tb.last_received_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT trace_id
         FROM spans
         WHERE trace_id IS NOT NULL AND trace_id != ''
         GROUP BY trace_id
       ) t`
    )
    .get() as { total: number };

  return c.json({
    ok: true,
    items,
    pagination: { offset, limit, total: totalRow.total }
  });
});

app.get('/api/traces/:traceId', (c) => {
  const traceId = c.req.param('traceId');
  const { limit, offset } = getPagination(c);

  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, resource_attributes, events
       FROM spans
       WHERE trace_id = ?
       ORDER BY CAST(start_time_unix_nano AS INTEGER) ASC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(traceId, limit, offset) as Array<{
      id: number;
      received_at: string;
      trace_id: string;
      span_id: string | null;
      parent_span_id: string | null;
      name: string | null;
      kind: number | null;
      start_time_unix_nano: string | null;
      end_time_unix_nano: string | null;
      duration_ns: number | null;
      attributes: string | null;
      status_code: number | null;
      resource_attributes: string | null;
      events: string | null;
    }>;

  const totalRow = db
    .prepare('SELECT COUNT(*) AS total FROM spans WHERE trace_id = ?')
    .get(traceId) as { total: number };

  const bySpanId = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    if (row.span_id) bySpanId.set(row.span_id, row);
  });

  const depthMemo = new Map<string, number>();
  const calcDepth = (row: (typeof rows)[number], seen = new Set<string>()): number => {
    if (!row.span_id) return 0;
    if (depthMemo.has(row.span_id)) return depthMemo.get(row.span_id)!;
    if (!row.parent_span_id) {
      depthMemo.set(row.span_id, 0);
      return 0;
    }

    const parent = bySpanId.get(row.parent_span_id);
    if (!parent) {
      depthMemo.set(row.span_id, 0);
      return 0;
    }

    if (seen.has(row.span_id)) {
      depthMemo.set(row.span_id, 0);
      return 0;
    }

    seen.add(row.span_id);
    const depth = calcDepth(parent, seen) + 1;
    depthMemo.set(row.span_id, depth);
    return depth;
  };

  const items = rows.map((row) => {
    const depth = calcDepth(row);
    return {
      ...row,
      has_parent: Boolean(row.parent_span_id),
      depth
    };
  });

  return c.json({
    ok: true,
    traceId,
    items,
    pagination: { offset, limit, total: totalRow.total }
  });
});

const port = Number(process.env.PORT || 4318);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[agent-lens/server] listening on http://localhost:${port}`);
  console.log(`[agent-lens/server] sqlite: ${dbPath}`);
});
