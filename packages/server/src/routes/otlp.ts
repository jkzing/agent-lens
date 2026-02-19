import type { Hono } from 'hono';
import type { RouteDeps } from './types.js';
import { otlpExportResponse } from './types.js';

export function registerOtlpRoutes(app: Hono, deps: RouteDeps) {
  const { insertSpan, decodeOtlpProtobufTraceRequest, extractSpans, db } = deps;

  app.post('/v1/traces', async (c) => {
    const contentType = (c.req.header('content-type') || '').toLowerCase();
    const receivedAt = new Date().toISOString();

    let body: any = null;
    let payload: string;

    if (contentType.includes('application/x-protobuf')) {
      const raw = Buffer.from(await c.req.arrayBuffer());
      payload = JSON.stringify({
        contentType: 'application/x-protobuf',
        encoding: 'base64',
        body: raw.toString('base64')
      });

      body = (() => {
        try {
          return decodeOtlpProtobufTraceRequest(raw);
        } catch {
          return null;
        }
      })();

      if (!body) {
        insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
        return otlpExportResponse(c, 1, 'Invalid protobuf payload');
      }
    } else {
      body = await c.req.json().catch(() => null);
      if (!body) {
        return otlpExportResponse(c, 1, 'Invalid JSON payload');
      }

      payload = JSON.stringify(body);
    }

    const parsedSpans = extractSpans(body);

    if (parsedSpans.length === 0) {
      insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
      return otlpExportResponse(c, 0, 'No valid spans found in payload');
    }

    try {
      db.exec('BEGIN');
      for (const row of parsedSpans) {
        insertSpan.run(
          receivedAt,
          row.traceId || null,
          row.spanId || null,
          row.parentSpanId,
          row.name,
          row.kind,
          row.startTimeUnixNano,
          row.endTimeUnixNano,
          row.durationNs,
          row.attributes,
          row.statusCode,
          row.status,
          row.resourceAttributes,
          row.events,
          payload
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return otlpExportResponse(c);
  });
}
