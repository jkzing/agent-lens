import type { Hono } from 'hono';
import { getPagination, normalizeBigInts } from '../services/lib.js';
import { listSpans } from '../services/spans.js';
import type { RouteDeps } from './types.js';

export function registerSpansRoutes(app: Hono, deps: RouteDeps) {
  const { db } = deps;

  app.get('/api/spans', (c) => {
    const { limit, offset } = getPagination({ limit: c.req.query('limit') ?? undefined, offset: c.req.query('offset') ?? undefined });
    const rows = listSpans(db, limit, offset);
    return c.json(normalizeBigInts({ ok: true, items: rows, pagination: { offset, limit } }));
  });
}
