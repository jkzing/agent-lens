import type { DatabaseSync } from 'node:sqlite';

export function listSpansPage(db: DatabaseSync, limit: number, offset: number) {
  return db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
       FROM spans
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
}
