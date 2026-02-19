import type { DatabaseSync } from 'node:sqlite';

export type TraceSpanStatsRow = {
  trace_id: string;
  attributes: string | null;
  resource_attributes: string | null;
};

export function listTracesPageBase(db: DatabaseSync, limit: number, offset: number) {
  return db
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
}

export function listSpanStatsByTraceIds(db: DatabaseSync, traceIds: string[]): TraceSpanStatsRow[] {
  if (traceIds.length === 0) {
    return [];
  }

  const placeholders = traceIds.map(() => '?').join(',');
  return db
    .prepare(`SELECT trace_id, attributes, resource_attributes FROM spans WHERE trace_id IN (${placeholders})`)
    .all(...traceIds) as TraceSpanStatsRow[];
}

export function countTraces(db: DatabaseSync) {
  return db
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
}

export function listTraceSpansPage(db: DatabaseSync, traceId: string, limit: number, offset: number) {
  return db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
       FROM spans
       WHERE trace_id = ?
       ORDER BY CAST(start_time_unix_nano AS INTEGER) ASC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(traceId, limit, offset);
}

export function countTraceSpans(db: DatabaseSync, traceId: string) {
  return db.prepare('SELECT COUNT(*) AS total FROM spans WHERE trace_id = ?').get(traceId) as { total: number };
}

export function listTraceSpansForExport(db: DatabaseSync, traceId: string) {
  return db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
       FROM spans
       WHERE trace_id = ?
       ORDER BY CAST(start_time_unix_nano AS INTEGER) ASC, id ASC`
    )
    .all(traceId);
}
