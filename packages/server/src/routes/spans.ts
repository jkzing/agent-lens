import type { Hono } from 'hono';
import type { RouteDeps } from './types.js';
import { getPagination, normalizeBigInts } from './types.js';

export function registerSpansRoutes(app: Hono, deps: RouteDeps) {
  const { db } = deps;

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

    return c.json(normalizeBigInts({ ok: true, items: rows, pagination: { offset, limit } }));
  });
}
