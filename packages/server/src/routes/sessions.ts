import type { Hono } from 'hono';
import { normalizeBigInts } from '../lib/bigint.js';
import { getSessionTimeline, getSessionsOverview } from '../services/sessions.js';
import type { RouteDeps } from './types.js';

const OVERVIEW_DEFAULT_LIMIT = 50;
const OVERVIEW_MAX_LIMIT = 200;
const TIMELINE_DEFAULT_LIMIT = 200;
const TIMELINE_MAX_LIMIT = 1000;

export function registerSessionsRoutes(app: Hono, deps: RouteDeps) {
  const { db } = deps;

  app.get('/api/sessions/overview', (c) => {
    const pagination = getBoundedPagination(
      {
        limit: c.req.query('limit') ?? undefined,
        offset: c.req.query('offset') ?? undefined
      },
      OVERVIEW_DEFAULT_LIMIT,
      OVERVIEW_MAX_LIMIT
    );

    const fromUnixNano = toUnixNanoFromMs(c.req.query('from'));
    const toUnixNano = toUnixNanoFromMs(c.req.query('to'));

    const result = getSessionsOverview(db, {
      ...pagination,
      q: c.req.query('q') ?? undefined,
      channel: c.req.query('channel') ?? undefined,
      eventType: c.req.query('eventType') ?? undefined,
      fromUnixNano,
      toUnixNano
    });

    return c.json(
      normalizeBigInts({
        ok: true,
        items: result.items,
        pagination: { ...pagination, total: result.total },
        meta: { unmapped_span_count: result.unmappedSpanCount }
      })
    );
  });

  app.get('/api/sessions/:sessionKey/timeline', (c) => {
    const sessionKey = c.req.param('sessionKey');
    const pagination = getBoundedPagination(
      {
        limit: c.req.query('limit') ?? undefined,
        offset: c.req.query('offset') ?? undefined
      },
      TIMELINE_DEFAULT_LIMIT,
      TIMELINE_MAX_LIMIT
    );

    const result = getSessionTimeline(db, {
      sessionKey,
      ...pagination,
      eventType: c.req.query('eventType') ?? undefined
    });

    return c.json(
      normalizeBigInts({
        ok: true,
        sessionKey,
        items: result.items,
        pagination: { ...pagination, total: result.total }
      })
    );
  });
}

function getBoundedPagination(input: { limit?: string; offset?: string }, defaultLimit: number, maxLimit: number) {
  const limitParam = Number(input.limit || defaultLimit);
  const offsetParam = Number(input.offset || 0);

  return {
    limit: Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, maxLimit)) : defaultLimit,
    offset: Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0
  };
}

function toUnixNanoFromMs(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return String(Math.trunc(ms * 1_000_000));
}
