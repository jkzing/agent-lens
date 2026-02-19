import type { DatabaseSync } from 'node:sqlite';
import { csvEscape, parseJson, toNumber } from './lib.js';

export function listTraces(db: DatabaseSync, limit: number, offset: number) {
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

  const traceIds = (items as Array<any>).map((item) => item.trace_id).filter(Boolean);
  const statsByTrace = new Map<string, { inputTokens: number; outputTokens: number; serviceNames: Set<string> }>();

  if (traceIds.length > 0) {
    const placeholders = traceIds.map(() => '?').join(',');
    const spanRows = db
      .prepare(`SELECT trace_id, attributes, resource_attributes FROM spans WHERE trace_id IN (${placeholders})`)
      .all(...traceIds) as Array<{ trace_id: string; attributes: string | null; resource_attributes: string | null }>;

    for (const row of spanRows) {
      const bucket =
        statsByTrace.get(row.trace_id) ??
        (() => {
          const init = { inputTokens: 0, outputTokens: 0, serviceNames: new Set<string>() };
          statsByTrace.set(row.trace_id, init);
          return init;
        })();

      const attrs = parseJson(row.attributes);
      bucket.inputTokens += toNumber(attrs['gen_ai.usage.input_tokens']);
      bucket.outputTokens += toNumber(attrs['gen_ai.usage.output_tokens']);

      const resourceAttrs = parseJson(row.resource_attributes);
      const serviceName = resourceAttrs['service.name'];
      if (typeof serviceName === 'string' && serviceName.trim()) {
        bucket.serviceNames.add(serviceName.trim());
      }
    }
  }

  const enrichedItems = (items as Array<any>).map((item) => {
    const stats = statsByTrace.get(item.trace_id);
    const serviceNames = stats ? Array.from(stats.serviceNames) : [];

    return {
      ...item,
      input_tokens: stats?.inputTokens ?? 0,
      output_tokens: stats?.outputTokens ?? 0,
      service_names: serviceNames,
      primary_service_name: serviceNames[0] ?? 'unknown'
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

  return {
    items: enrichedItems,
    total: totalRow.total
  };
}

export function getTraceDetail(db: DatabaseSync, traceId: string, limit: number, offset: number) {
  const rows = db
    .prepare(
      `SELECT id, received_at, trace_id, span_id, parent_span_id, name, kind, start_time_unix_nano, end_time_unix_nano, duration_ns,
              attributes, status_code, status, resource_attributes, events
       FROM spans
       WHERE trace_id = ?
       ORDER BY CAST(start_time_unix_nano AS INTEGER) ASC, id ASC
       LIMIT ? OFFSET ?`
    )
    .all(traceId, limit, offset) as Array<any>;

  const totalRow = db.prepare('SELECT COUNT(*) AS total FROM spans WHERE trace_id = ?').get(traceId) as { total: number };

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

  const items = rows.map((row) => ({ ...row, has_parent: Boolean(row.parent_span_id), depth: calcDepth(row) }));

  return {
    items,
    total: totalRow.total
  };
}

export function exportTrace(db: DatabaseSync, traceId: string, format: string) {
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
    return { rows, csv: lines.join('\n') };
  }

  return { rows };
}
