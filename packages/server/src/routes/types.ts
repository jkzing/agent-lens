import type { Context } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import type { ParsedSpan } from '../otlp.js';

export type RouteDeps = {
  db: DatabaseSync;
  insertSpan: any;
  insertMetricPayload: any;
  insertLogPayload: any;
  decodeOtlpProtobufTraceRequest: (raw: Buffer) => any;
  decodeOtlpProtobufMetricsRequest: (raw: Buffer) => any;
  decodeOtlpProtobufLogsRequest: (raw: Buffer) => any;
  extractSpans: (body: any) => ParsedSpan[];
  countMetricDataPoints: (body: any) => number;
  countLogRecords: (body: any) => number;
};

export function otlpExportResponse(
  c: Context,
  rejectedCount = 0,
  errorMessage = '',
  rejectedField = 'rejectedSpans'
) {
  if (rejectedCount > 0 || errorMessage) {
    return c.json({
      partialSuccess: {
        [rejectedField]: rejectedCount,
        errorMessage
      }
    });
  }

  return c.json({});
}
