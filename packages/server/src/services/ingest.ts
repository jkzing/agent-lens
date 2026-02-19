import type { DatabaseSync } from 'node:sqlite';
import type { ParsedSpan } from '../otlp.js';

export type IngestDeps = {
  db: DatabaseSync;
  insertSpan: any;
  decodeOtlpProtobufTraceRequest: (raw: Buffer) => any;
  extractSpans: (body: any) => ParsedSpan[];
};

export type IngestResult = {
  rejectedSpans: number;
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
      insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
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
    insertSpan.run(receivedAt, null, null, null, null, null, null, null, null, null, null, null, null, null, payload);
    return { rejectedSpans: 0, errorMessage: 'No valid spans found in payload' };
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

  return { rejectedSpans: 0, errorMessage: '' };
}
