import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDbClient } from './db/client.js';
import { backfillDerivedSpanColumns, bootstrapSchema } from './db/schema.js';
import {
  countLogRecords,
  countMetricDataPoints,
  decodeOtlpProtobufLogsRequest,
  decodeOtlpProtobufMetricsRequest,
  decodeOtlpProtobufTraceRequest,
  extractSpans
} from './otlp.js';
import { registerRoutes } from './routes/index.js';

export type AppRuntime = {
  app: Hono;
  db: ReturnType<typeof createDbClient>;
};

export function createApp(dbPath: string): AppRuntime {
  const app = new Hono();
  app.use('*', cors());

  const db = createDbClient(dbPath);
  bootstrapSchema(db);

  const insertSpan = db.prepare(`
    INSERT INTO spans (
      received_at,
      trace_id,
      span_id,
      parent_span_id,
      name,
      kind,
      start_time_unix_nano,
      end_time_unix_nano,
      duration_ns,
      attributes,
      status_code,
      status,
      resource_attributes,
      events,
      event_type,
      session_key,
      session_id,
      channel,
      state,
      outcome,
      payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMetricPayload = db.prepare(`
    INSERT INTO metric_payloads (
      received_at,
      content_type,
      payload,
      parse_status,
      parse_error,
      item_count,
      service_name,
      session_key,
      metric_names
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLogPayload = db.prepare(`
    INSERT INTO log_payloads (
      received_at,
      content_type,
      payload,
      parse_status,
      parse_error,
      item_count,
      service_name,
      session_key,
      severity_text,
      severity_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const maxBackfillRows = Number(process.env.AGENT_LENS_DERIVED_BACKFILL_LIMIT || '1000');
  if (Number.isFinite(maxBackfillRows) && maxBackfillRows > 0) {
    backfillDerivedSpanColumns(db, Math.floor(maxBackfillRows));
  }

  registerRoutes(app, {
    db,
    insertSpan,
    insertMetricPayload,
    insertLogPayload,
    decodeOtlpProtobufTraceRequest,
    decodeOtlpProtobufMetricsRequest,
    decodeOtlpProtobufLogsRequest,
    extractSpans,
    countMetricDataPoints,
    countLogRecords
  });

  return { app, db };
}
