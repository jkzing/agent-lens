import type { Hono } from 'hono';
import { getSignalIngestSummary, ingestSignalRequest, ingestTraceRequest } from '../services/ingest.js';
import { listLogPayloadRecords, listMetricPayloadRecords } from '../services/signal-records.js';
import { getPagination } from '../lib/pagination.js';
import { normalizeBigInts } from '../lib/bigint.js';
import type { RouteDeps } from './types.js';
import { otlpExportResponse } from './types.js';

export function registerOtlpRoutes(app: Hono, deps: RouteDeps) {
  app.post('/v1/traces', async (c) => {
    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const result = await ingestTraceRequest(contentType, () => c.req.json(), () => c.req.arrayBuffer(), deps);
    return otlpExportResponse(c, result.rejectedSpans, result.errorMessage, 'rejectedSpans');
  });

  app.post('/v1/metrics', async (c) => {
    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const result = await ingestSignalRequest('metrics', contentType, () => c.req.json(), () => c.req.arrayBuffer(), deps);
    return otlpExportResponse(c, result.rejectedItems, result.errorMessage, 'rejectedDataPoints');
  });

  app.post('/v1/logs', async (c) => {
    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const result = await ingestSignalRequest('logs', contentType, () => c.req.json(), () => c.req.arrayBuffer(), deps);
    return otlpExportResponse(c, result.rejectedItems, result.errorMessage, 'rejectedLogRecords');
  });

  app.get('/api/metrics/ingest-summary', (c) => {
    const summary = getSignalIngestSummary(deps.db, 'metric_payloads');
    return c.json({ ok: true, signal: 'metrics', ...summary });
  });

  app.get('/api/logs/ingest-summary', (c) => {
    const summary = getSignalIngestSummary(deps.db, 'log_payloads');
    return c.json({ ok: true, signal: 'logs', ...summary });
  });

  app.get('/api/metrics/records', (c) => {
    const { limit, offset } = getPagination({
      limit: c.req.query('limit') ?? undefined,
      offset: c.req.query('offset') ?? undefined
    });

    const result = listMetricPayloadRecords(deps.db, limit, offset, {
      from: c.req.query('from') ?? undefined,
      to: c.req.query('to') ?? undefined,
      service: c.req.query('service') ?? undefined,
      sessionKey: c.req.query('sessionKey') ?? undefined,
      parseStatus: c.req.query('parseStatus') ?? undefined,
      metricName: c.req.query('metricName') ?? undefined
    });

    return c.json(
      normalizeBigInts({
        ok: true,
        items: result.items,
        pagination: { offset, limit, total: result.total }
      })
    );
  });

  app.get('/api/logs/records', (c) => {
    const { limit, offset } = getPagination({
      limit: c.req.query('limit') ?? undefined,
      offset: c.req.query('offset') ?? undefined
    });

    const result = listLogPayloadRecords(deps.db, limit, offset, {
      from: c.req.query('from') ?? undefined,
      to: c.req.query('to') ?? undefined,
      service: c.req.query('service') ?? undefined,
      sessionKey: c.req.query('sessionKey') ?? undefined,
      parseStatus: c.req.query('parseStatus') ?? undefined,
      severity: c.req.query('severity') ?? undefined
    });

    return c.json(
      normalizeBigInts({
        ok: true,
        items: result.items,
        pagination: { offset, limit, total: result.total }
      })
    );
  });
}
