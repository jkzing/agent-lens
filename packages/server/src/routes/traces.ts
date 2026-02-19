import type { Hono } from 'hono';
import { normalizeBigInts } from '../lib/bigint.js';
import { getPagination } from '../lib/pagination.js';
import { exportTrace, getTraceDetail, listTraces } from '../services/traces.js';
import type { RouteDeps } from './types.js';

export function registerTracesRoutes(app: Hono, deps: RouteDeps) {
  const { db } = deps;

  app.get('/api/traces', (c) => {
    const { limit, offset } = getPagination({ limit: c.req.query('limit') ?? undefined, offset: c.req.query('offset') ?? undefined });
    const result = listTraces(db, limit, offset);

    return c.json(
      normalizeBigInts({
        ok: true,
        items: result.items,
        pagination: { offset, limit, total: result.total }
      })
    );
  });

  app.get('/api/traces/:traceId/export', (c) => {
    const traceId = c.req.param('traceId');
    const format = (c.req.query('format') || 'json').toLowerCase();
    const result = exportTrace(db, traceId, format);

    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="trace-${traceId}.csv"`);
      return c.body(result.csv || '');
    }

    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="trace-${traceId}.json"`);
    return c.json(normalizeBigInts({ ok: true, traceId, items: result.rows }));
  });

  app.get('/api/traces/:traceId', (c) => {
    const traceId = c.req.param('traceId');
    const { limit, offset } = getPagination({ limit: c.req.query('limit') ?? undefined, offset: c.req.query('offset') ?? undefined });
    const result = getTraceDetail(db, traceId, limit, offset);

    return c.json(
      normalizeBigInts({
        ok: true,
        traceId,
        items: result.items,
        pagination: { offset, limit, total: result.total }
      })
    );
  });
}
