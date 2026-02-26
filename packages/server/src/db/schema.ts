import type { DatabaseSync } from 'node:sqlite';
import { extractSessionFields } from '../lib/session-extract.js';

const DERIVED_COLUMNS = [
  'event_type',
  'session_key',
  'session_id',
  'channel',
  'state',
  'outcome'
] as const;

export function bootstrapSchema(db: DatabaseSync) {
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
  event_type TEXT,
  session_key TEXT,
  session_id TEXT,
  channel TEXT,
  state TEXT,
  outcome TEXT,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metric_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  content_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  parse_error TEXT,
  item_count INTEGER,
  service_name TEXT,
  session_key TEXT,
  metric_names TEXT
);

CREATE TABLE IF NOT EXISTS log_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  content_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  parse_error TEXT,
  item_count INTEGER,
  service_name TEXT,
  session_key TEXT,
  severity_text TEXT,
  severity_number INTEGER
);
`);

  const existingColumns = db
    .prepare('PRAGMA table_info(spans)')
    .all() as Array<{ name: string }>;
  const columnSet = new Set(existingColumns.map((col) => col.name));

  const ensureColumn = (name: string, type: string) => {
    if (!columnSet.has(name)) {
      db.exec(`ALTER TABLE spans ADD COLUMN ${name} ${type}`);
      columnSet.add(name);
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

  ensureColumn('event_type', 'TEXT');
  ensureColumn('session_key', 'TEXT');
  ensureColumn('session_id', 'TEXT');
  ensureColumn('channel', 'TEXT');
  ensureColumn('state', 'TEXT');
  ensureColumn('outcome', 'TEXT');

  const ensureTableColumn = (tableName: string, columnName: string, type: string) => {
    const tableColumns = db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;
    const tableColumnSet = new Set(tableColumns.map((col) => col.name));
    if (!tableColumnSet.has(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type}`);
    }
  };

  ensureTableColumn('metric_payloads', 'service_name', 'TEXT');
  ensureTableColumn('metric_payloads', 'session_key', 'TEXT');
  ensureTableColumn('metric_payloads', 'metric_names', 'TEXT');

  ensureTableColumn('log_payloads', 'service_name', 'TEXT');
  ensureTableColumn('log_payloads', 'session_key', 'TEXT');
  ensureTableColumn('log_payloads', 'severity_text', 'TEXT');
  ensureTableColumn('log_payloads', 'severity_number', 'INTEGER');

  db.exec(`
CREATE INDEX IF NOT EXISTS idx_spans_received_at ON spans(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_session_key_start ON spans(session_key, CAST(start_time_unix_nano AS INTEGER), id);
CREATE INDEX IF NOT EXISTS idx_spans_channel ON spans(channel);
CREATE INDEX IF NOT EXISTS idx_spans_event_type_start_time ON spans(event_type, CAST(start_time_unix_nano AS INTEGER));

-- PR4 hardening: expression indexes remain for compatibility while rows are progressively backfilled.
CREATE INDEX IF NOT EXISTS idx_spans_session_key_start_expr ON spans(
  COALESCE(
    json_extract(attributes, '$."openclaw.sessionKey"'),
    json_extract(attributes, '$."openclaw.sessionId"'),
    json_extract(resource_attributes, '$."openclaw.sessionKey"'),
    json_extract(resource_attributes, '$."openclaw.sessionId"')
  ),
  CAST(start_time_unix_nano AS INTEGER),
  id
);
CREATE INDEX IF NOT EXISTS idx_spans_channel_expr ON spans(
  COALESCE(
    json_extract(attributes, '$."openclaw.channel"'),
    json_extract(attributes, '$.channel'),
    json_extract(resource_attributes, '$."openclaw.channel"'),
    json_extract(resource_attributes, '$.channel')
  )
);
CREATE INDEX IF NOT EXISTS idx_spans_name_start_time ON spans(
  name,
  CAST(start_time_unix_nano AS INTEGER)
);

CREATE INDEX IF NOT EXISTS idx_metric_payloads_received_at ON metric_payloads(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_metric_payloads_parse_status ON metric_payloads(parse_status);
CREATE INDEX IF NOT EXISTS idx_metric_payloads_service_name ON metric_payloads(service_name);
CREATE INDEX IF NOT EXISTS idx_metric_payloads_session_key ON metric_payloads(session_key);
CREATE INDEX IF NOT EXISTS idx_log_payloads_received_at ON log_payloads(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_payloads_parse_status ON log_payloads(parse_status);
CREATE INDEX IF NOT EXISTS idx_log_payloads_service_name ON log_payloads(service_name);
CREATE INDEX IF NOT EXISTS idx_log_payloads_session_key ON log_payloads(session_key);
CREATE INDEX IF NOT EXISTS idx_log_payloads_severity_number ON log_payloads(severity_number);
CREATE INDEX IF NOT EXISTS idx_log_payloads_severity_text ON log_payloads(severity_text);
`);
}

export function backfillDerivedSpanColumns(db: DatabaseSync, limit = 1000): number {
  if (limit <= 0) return 0;

  const rows = db
    .prepare(
      `SELECT id, name, attributes, resource_attributes
       FROM spans
       WHERE ${DERIVED_COLUMNS.map((column) => `${column} IS NULL`).join(' OR ')}
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(limit) as Array<{
    id: number;
    name: string | null;
    attributes: string | null;
    resource_attributes: string | null;
  }>;

  if (rows.length === 0) return 0;

  const update = db.prepare(`
    UPDATE spans
    SET event_type = ?,
        session_key = ?,
        session_id = ?,
        channel = ?,
        state = ?,
        outcome = ?
    WHERE id = ?
  `);

  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const derived = extractSessionFields(row.attributes, row.resource_attributes);
      update.run(
        row.name?.trim() || null,
        derived.sessionKey,
        derived.sessionId,
        derived.channel,
        derived.state,
        derived.outcome,
        row.id
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return rows.length;
}
