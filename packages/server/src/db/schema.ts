import type { DatabaseSync } from 'node:sqlite';

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
}
