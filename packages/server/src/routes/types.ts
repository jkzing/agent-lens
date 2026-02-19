import type { Context } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { ParsedSpan } from '../otlp.js';

export type RouteDeps = {
  db: DatabaseSync;
  insertSpan: any;
  decodeOtlpProtobufTraceRequest: (raw: Buffer) => any;
  extractSpans: (body: any) => ParsedSpan[];
};

export function otlpExportResponse(c: Context, rejectedSpans = 0, errorMessage = '') {
  if (rejectedSpans > 0 || errorMessage) {
    return c.json({
      partialSuccess: {
        rejectedSpans,
        errorMessage
      }
    });
  }

  return c.json({});
}
