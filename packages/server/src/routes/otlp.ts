import type { Hono } from 'hono';
import { ingestTraceRequest } from '../services/ingest.js';
import type { RouteDeps } from './types.js';
import { otlpExportResponse } from './types.js';

export function registerOtlpRoutes(app: Hono, deps: RouteDeps) {
  app.post('/v1/traces', async (c) => {
    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const result = await ingestTraceRequest(contentType, () => c.req.json(), () => c.req.arrayBuffer(), deps);
    return otlpExportResponse(c, result.rejectedSpans, result.errorMessage);
  });
}
