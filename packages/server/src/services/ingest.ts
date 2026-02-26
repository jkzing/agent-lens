import type { DatabaseSync } from 'node:sqlite';
import { extractSessionFields } from '../lib/session-extract.js';
import { extractLogsPayloadSummary, extractMetricsPayloadSummary, type ParsedSpan } from '../otlp.js';

export type IngestDeps = {
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

export type IngestResult = {
  rejectedSpans: number;
  errorMessage: string;
};

export type SignalIngestResult = {
  rejectedItems: number;
  errorMessage: string;
};

export async function ingestTraceRequest(
  contentType: string,
  readJson: () => Promise<any>,
  readArrayBuffer: () => Promise<ArrayBuffer>,
  deps: IngestDeps
): Promise<IngestResult> {
  const { insertSpan, decodeOtlpProtobufTraceRequest, extractSpans, db } = deps;
  const receivedAt = new Date().toISOString();

  let body: any = null;
  let payload: string;

  if (contentType.includes('application/x-protobuf')) {
    const raw = Buffer.from(await readArrayBuffer());
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
      insertSpan.run(
        receivedAt,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        payload
      );
      return { rejectedSpans: 1, errorMessage: 'Invalid protobuf payload' };
    }
  } else {
    body = await readJson().catch(() => null);
    if (!body) {
      return { rejectedSpans: 1, errorMessage: 'Invalid JSON payload' };
    }

    payload = JSON.stringify(body);
  }

  const parsedSpans = extractSpans(body);

  if (parsedSpans.length === 0) {
    insertSpan.run(
      receivedAt,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      payload
    );
    return { rejectedSpans: 0, errorMessage: 'No valid spans found in payload' };
  }

  try {
    db.exec('BEGIN');
    for (const row of parsedSpans) {
      const derived = extractSessionFields(row.attributes, row.resourceAttributes);

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
        row.name?.trim() || null,
        derived.sessionKey,
        derived.sessionId,
        derived.channel,
        derived.state,
        derived.outcome,
        payload
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { rejectedSpans: 0, errorMessage: '' };
}

type SignalMode = 'metrics' | 'logs';

export async function ingestSignalRequest(
  signal: SignalMode,
  contentType: string,
  readJson: () => Promise<any>,
  readArrayBuffer: () => Promise<ArrayBuffer>,
  deps: IngestDeps
): Promise<SignalIngestResult> {
  const receivedAt = new Date().toISOString();
  const isMetrics = signal === 'metrics';
  const decode = isMetrics ? deps.decodeOtlpProtobufMetricsRequest : deps.decodeOtlpProtobufLogsRequest;
  const countItems = isMetrics ? deps.countMetricDataPoints : deps.countLogRecords;
  const insertPayload = isMetrics ? deps.insertMetricPayload : deps.insertLogPayload;

  const insertErrorPayload = (receivedAtValue: string, type: string, rawPayload: string, error: string) => {
    if (isMetrics) {
      insertPayload.run(receivedAtValue, type, rawPayload, 'error', error, null, null, null, null);
      return;
    }
    insertPayload.run(receivedAtValue, type, rawPayload, 'error', error, null, null, null, null, null);
  };

  const insertOkPayload = (receivedAtValue: string, type: string, rawPayload: string, itemCount: number, bodyValue: any) => {
    if (isMetrics) {
      const summary = extractMetricsPayloadSummary(bodyValue);
      insertPayload.run(
        receivedAtValue,
        type,
        rawPayload,
        'ok',
        null,
        itemCount,
        summary.serviceName,
        summary.sessionKey,
        summary.metricNames.length > 0 ? JSON.stringify(summary.metricNames) : null
      );
      return;
    }

    const summary = extractLogsPayloadSummary(bodyValue);
    insertPayload.run(
      receivedAtValue,
      type,
      rawPayload,
      'ok',
      null,
      itemCount,
      summary.serviceName,
      summary.sessionKey,
      summary.severityText,
      summary.severityNumber
    );
  };

  let body: any = null;
  let payload: string;

  if (contentType.includes('application/x-protobuf')) {
    const raw = Buffer.from(await readArrayBuffer());
    payload = JSON.stringify({
      contentType: 'application/x-protobuf',
      encoding: 'base64',
      body: raw.toString('base64')
    });

    body = (() => {
      try {
        return decode(raw);
      } catch {
        return null;
      }
    })();
  } else {
    body = await readJson().catch(() => null);
    if (!body) {
      insertErrorPayload(receivedAt, contentType || 'application/json', '{}', 'Invalid JSON payload');
      return { rejectedItems: 1, errorMessage: 'Invalid JSON payload' };
    }
    payload = JSON.stringify(body);
  }

  if (!body) {
    insertErrorPayload(receivedAt, contentType || 'application/x-protobuf', payload!, 'Invalid protobuf payload');
    return { rejectedItems: 1, errorMessage: 'Invalid protobuf payload' };
  }

  const itemCount = countItems(body);
  insertOkPayload(receivedAt, contentType || 'application/json', payload!, itemCount, body);
  return { rejectedItems: 0, errorMessage: '' };
}

export function getSignalIngestSummary(db: DatabaseSync, tableName: 'metric_payloads' | 'log_payloads') {
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS total_records,
        MAX(received_at) AS last_received_at,
        SUM(CASE WHEN parse_status = 'error' THEN 1 ELSE 0 END) AS parse_error_count
      FROM ${tableName}`
    )
    .get() as {
    total_records: number;
    last_received_at: string | null;
    parse_error_count: number;
  };

  const recent = db
    .prepare(
      `SELECT id, received_at, content_type, parse_status, parse_error, item_count
       FROM ${tableName}
       ORDER BY id DESC
       LIMIT 10`
    )
    .all() as Array<{
    id: number;
    received_at: string;
    content_type: string;
    parse_status: string;
    parse_error: string | null;
    item_count: number | null;
  }>;

  return {
    total_records: Number(totals.total_records || 0),
    last_received_at: totals.last_received_at || null,
    parse_error_count: Number(totals.parse_error_count || 0),
    recent_records: recent.map((row) => ({
      ...row,
      id: Number(row.id),
      item_count: row.item_count == null ? null : Number(row.item_count)
    }))
  };
}
