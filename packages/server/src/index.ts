import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { Hono, type Context } from 'hono';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { decodeOtlpProtobufTraceRequest, extractSpans, type ParsedSpan } from './otlp.js';

const app = new Hono();
app.use('*', cors());

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'agent-lens.db');
const db = new Database(dbPath);

const uiDistPath = path.resolve(process.env.UI_DIST ?? path.join(process.cwd(), '../ui/dist'));
const hasUiDist = fs.existsSync(path.join(uiDistPath, 'index.html'));

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
  status TEXT,
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
ensureColumn('status', 'TEXT');
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
    status,
    resource_attributes,
    events,
    payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

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

  let body: any = null;
  let payload: string;

  if (contentType.includes('application/x-protobuf')) {
    const raw = Buffer.from(await c.req.arrayBuffer());
    payload = JSON.stringify({
      contentType: 'application/x-protobuf',
      encoding: 'base64',
      body: raw.toString('base64')
    });

    body = (() => {
      try {
        return decodeOtlpProtobufTraceRequest(raw);
      } catch {
        return null;
      }
    })();

    if (!body) {
      insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
      return otlpExportResponse(c, 1, 'Invalid protobuf payload');
    }
  } else {
    body = await c.req.json().catch(() => null);
    if (!body) {
      return otlpExportResponse(c, 1, 'Invalid JSON payload');
    }

    payload = JSON.stringify(body);
  }

  const parsedSpans = extractSpans(body);

  if (parsedSpans.length === 0) {
    insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
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
        row.status,
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
              attributes, status_code, status, resource_attributes, events
       FROM spans
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);

  return c.json({ ok: true, items: rows, pagination: { offset, limit } });
});

function parseJson(input: string | null): Record<string, any> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

  const enrichedItems = (items as Array<any>).map((item) => {
    const spanRows = db
      .prepare('SELECT attributes, resource_attributes FROM spans WHERE trace_id = ?')
      .all(item.trace_id) as Array<{ attributes: string | null; resource_attributes: string | null }>;

    let inputTokens = 0;
    let outputTokens = 0;
    const serviceNames = new Set<string>();

    for (const row of spanRows) {
      const attrs = parseJson(row.attributes);
      inputTokens += toNumber(attrs['gen_ai.usage.input_tokens']);
      outputTokens += toNumber(attrs['gen_ai.usage.output_tokens']);

      const resourceAttrs = parseJson(row.resource_attributes);
      const serviceName = resourceAttrs['service.name'];
      if (typeof serviceName === 'string' && serviceName.trim()) {
        serviceNames.add(serviceName.trim());
      }
    }

    return {
      ...item,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      service_names: Array.from(serviceNames),
      primary_service_name: Array.from(serviceNames)[0] ?? 'unknown'
    };
  });

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
    items: enrichedItems,
    pagination: { offset, limit, total: totalRow.total }
  });
});

app.get('/api/traces/:traceId/export', (c) => {
  const traceId = c.req.param('traceId');
  const format = (c.req.query('format') || 'json').toLowerCase();

  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
       FROM spans
       WHERE trace_id = ?
       ORDER BY CAST(start_time_unix_nano AS INTEGER) ASC, id ASC`
    )
    .all(traceId);

  if (format === 'csv') {
    const header = ['trace_id', 'span_id', 'parent_span_id', 'name', 'start', 'end', 'duration', 'status_code'];
    const lines = [header.join(',')];
    for (const row of rows as Array<any>) {
      lines.push(
        [
          row.trace_id,
          row.span_id,
          row.parent_span_id,
          row.name,
          row.start_time_unix_nano,
          row.end_time_unix_nano,
          row.duration_ns,
          row.status_code
        ]
          .map(csvEscape)
          .join(',')
      );
    }
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="trace-${traceId}.csv"`);
    return c.body(lines.join('\n'));
  }

  c.header('Content-Type', 'application/json; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="trace-${traceId}.json"`);
  return c.json({ ok: true, traceId, items: rows });
});

app.get('/api/traces/:traceId', (c) => {
  const traceId = c.req.param('traceId');
  const { limit, offset } = getPagination(c);

  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
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
      status: string | null;
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

if (hasUiDist) {
  app.use('/static/*', serveStatic({ root: uiDistPath }));
  app.use('/assets/*', serveStatic({ root: uiDistPath }));
  app.get('*', serveStatic({ path: path.join(uiDistPath, 'index.html') }));
}

const port = Number(process.env.PORT || 4318);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[agent-lens/server] listening on http://localhost:${port}`);
  console.log(`[agent-lens/server] sqlite: ${dbPath}`);
  if (hasUiDist) {
    console.log(`[agent-lens/server] serving ui: ${uiDistPath}`);
  }
});

const shutdown = (signal: string) => {
  console.log(`[agent-lens/server] received ${signal}, shutting down...`);
  db.close();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
