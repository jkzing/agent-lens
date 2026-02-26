import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const otlpRoot = require('@opentelemetry/otlp-transformer/build/src/generated/root.js');

const exportTraceServiceRequestType =
  otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
const exportMetricsServiceRequestType =
  otlpRoot.opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceRequest;
const exportLogsServiceRequestType =
  otlpRoot.opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest;

export type ParsedSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number | null;
  startTimeUnixNano: string | null;
  endTimeUnixNano: string | null;
  durationNs: number | null;
  attributes: string | null;
  statusCode: number | null;
  status: string | null;
  resourceAttributes: string | null;
  events: string | null;
};

function parseDurationNs(start?: string | number, end?: string | number): number | null {
  if (start == null || end == null) return null;
  const startNs = BigInt(String(start));
  const endNs = BigInt(String(end));
  const diff = endNs - startNs;
  if (diff < 0n) return null;
  if (diff > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(diff);
}

function toAttributeValue(value: any): unknown {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('intValue' in value) return Number(value.intValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('boolValue' in value) return Boolean(value.boolValue);
  if ('bytesValue' in value) {
    const bytesValue = value.bytesValue;
    if (bytesValue instanceof Uint8Array) return Buffer.from(bytesValue).toString('base64');
    return String(bytesValue);
  }
  if ('arrayValue' in value) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((item: any) => toAttributeValue(item));
  }
  if ('kvlistValue' in value) {
    const values = Array.isArray(value.kvlistValue?.values) ? value.kvlistValue.values : [];
    const result: Record<string, unknown> = {};
    for (const item of values) {
      if (!item?.key) continue;
      result[item.key] = toAttributeValue(item.value);
    }
    return result;
  }
  return value;
}

function parseAttributeList(attributes: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const items = Array.isArray(attributes) ? attributes : [];

  for (const item of items) {
    if (!item?.key) continue;
    result[item.key] = toAttributeValue(item.value);
  }

  return result;
}

function bytesToHex(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  if (Array.isArray(value)) return Buffer.from(value).toString('hex');
  return '';
}

function normalizeStatus(status: any): { statusCode: number | null; status: string | null } {
  if (!status || typeof status !== 'object') {
    return { statusCode: null, status: null };
  }

  const statusCode = typeof status.code === 'number' ? status.code : null;
  return {
    statusCode,
    status: JSON.stringify({
      code: statusCode,
      message: typeof status.message === 'string' ? status.message : ''
    })
  };
}

export function extractSpans(body: any): ParsedSpan[] {
  const output: ParsedSpan[] = [];
  const resourceSpans = Array.isArray(body?.resourceSpans) ? body.resourceSpans : [];

  for (const resourceSpan of resourceSpans) {
    const resourceAttrs = parseAttributeList(resourceSpan?.resource?.attributes);
    const scopeSpans = Array.isArray(resourceSpan?.scopeSpans) ? resourceSpan.scopeSpans : [];

    for (const scopeSpan of scopeSpans) {
      const spans = Array.isArray(scopeSpan?.spans) ? scopeSpan.spans : [];

      for (const span of spans) {
        const events = Array.isArray(span?.events) ? span.events : [];
        const normalizedEvents = events.map((event: any) => ({
          ...event,
          timeUnixNano: event?.timeUnixNano ? String(event.timeUnixNano) : null,
          attributes: parseAttributeList(event?.attributes)
        }));
        const { statusCode, status } = normalizeStatus(span?.status);

        output.push({
          traceId: bytesToHex(span?.traceId),
          spanId: bytesToHex(span?.spanId),
          parentSpanId: bytesToHex(span?.parentSpanId) || null,
          name: span?.name ?? 'unknown',
          kind: typeof span?.kind === 'number' ? span.kind : null,
          startTimeUnixNano: span?.startTimeUnixNano ? String(span.startTimeUnixNano) : null,
          endTimeUnixNano: span?.endTimeUnixNano ? String(span.endTimeUnixNano) : null,
          durationNs: parseDurationNs(span?.startTimeUnixNano, span?.endTimeUnixNano),
          attributes: JSON.stringify(parseAttributeList(span?.attributes)),
          statusCode,
          status,
          resourceAttributes: JSON.stringify(resourceAttrs),
          events: normalizedEvents.length > 0 ? JSON.stringify(normalizedEvents) : null
        });
      }
    }
  }

  return output;
}

export function decodeOtlpProtobufTraceRequest(raw: Buffer): any {
  return exportTraceServiceRequestType.decode(raw);
}

export function decodeOtlpProtobufMetricsRequest(raw: Buffer): any {
  return exportMetricsServiceRequestType.decode(raw);
}

export function decodeOtlpProtobufLogsRequest(raw: Buffer): any {
  return exportLogsServiceRequestType.decode(raw);
}

export function countMetricDataPoints(body: any): number {
  let count = 0;
  const resourceMetrics = Array.isArray(body?.resourceMetrics) ? body.resourceMetrics : [];
  for (const rm of resourceMetrics) {
    const scopeMetrics = Array.isArray(rm?.scopeMetrics) ? rm.scopeMetrics : [];
    for (const sm of scopeMetrics) {
      const metrics = Array.isArray(sm?.metrics) ? sm.metrics : [];
      for (const metric of metrics) {
        const candidates = [
          metric?.gauge?.dataPoints,
          metric?.sum?.dataPoints,
          metric?.histogram?.dataPoints,
          metric?.exponentialHistogram?.dataPoints,
          metric?.summary?.dataPoints
        ];
        let matched = false;
        for (const points of candidates) {
          if (Array.isArray(points)) {
            count += points.length;
            matched = true;
            break;
          }
        }
        if (!matched) count += 1;
      }
    }
  }
  return count;
}

export function countLogRecords(body: any): number {
  let count = 0;
  const resourceLogs = Array.isArray(body?.resourceLogs) ? body.resourceLogs : [];
  for (const rl of resourceLogs) {
    const scopeLogs = Array.isArray(rl?.scopeLogs) ? rl.scopeLogs : [];
    for (const sl of scopeLogs) {
      const logRecords = Array.isArray(sl?.logRecords) ? sl.logRecords : [];
      count += logRecords.length;
    }
  }
  return count;
}

type SignalSummaryBase = {
  serviceName: string | null;
  sessionKey: string | null;
};

export type MetricsPayloadSummary = SignalSummaryBase & {
  metricNames: string[];
};

export type LogsPayloadSummary = SignalSummaryBase & {
  severityText: string | null;
  severityNumber: number | null;
};

function pickServiceName(resourceAttributes: Record<string, unknown>): string | null {
  const value = resourceAttributes['service.name'];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function pickSessionKey(attributes: Record<string, unknown>, resourceAttributes: Record<string, unknown>): string | null {
  const session =
    typeof attributes['openclaw.sessionKey'] === 'string'
      ? attributes['openclaw.sessionKey']
      : typeof attributes['openclaw.sessionId'] === 'string'
        ? attributes['openclaw.sessionId']
        : typeof resourceAttributes['openclaw.sessionKey'] === 'string'
          ? resourceAttributes['openclaw.sessionKey']
          : typeof resourceAttributes['openclaw.sessionId'] === 'string'
            ? resourceAttributes['openclaw.sessionId']
            : null;

  if (!session) return null;
  const normalized = session.trim();
  return normalized || null;
}

export function extractMetricsPayloadSummary(body: any): MetricsPayloadSummary {
  const resourceMetrics = Array.isArray(body?.resourceMetrics) ? body.resourceMetrics : [];

  let serviceName: string | null = null;
  let sessionKey: string | null = null;
  const metricNames = new Set<string>();

  for (const rm of resourceMetrics) {
    const resourceAttributes = parseAttributeList(rm?.resource?.attributes);
    serviceName ||= pickServiceName(resourceAttributes);
    sessionKey ||= pickSessionKey({}, resourceAttributes);

    const scopeMetrics = Array.isArray(rm?.scopeMetrics) ? rm.scopeMetrics : [];
    for (const sm of scopeMetrics) {
      const metrics = Array.isArray(sm?.metrics) ? sm.metrics : [];
      for (const metric of metrics) {
        if (typeof metric?.name === 'string' && metric.name.trim()) {
          metricNames.add(metric.name.trim());
        }

        const candidates = [
          metric?.gauge?.dataPoints,
          metric?.sum?.dataPoints,
          metric?.histogram?.dataPoints,
          metric?.exponentialHistogram?.dataPoints,
          metric?.summary?.dataPoints
        ];

        for (const points of candidates) {
          if (!Array.isArray(points)) continue;
          for (const point of points) {
            if (sessionKey) break;
            const attrs = parseAttributeList(point?.attributes);
            sessionKey ||= pickSessionKey(attrs, resourceAttributes);
          }
        }
      }
    }
  }

  return {
    serviceName,
    sessionKey,
    metricNames: Array.from(metricNames)
  };
}

export function extractLogsPayloadSummary(body: any): LogsPayloadSummary {
  const resourceLogs = Array.isArray(body?.resourceLogs) ? body.resourceLogs : [];

  let serviceName: string | null = null;
  let sessionKey: string | null = null;
  let severityNumber: number | null = null;
  let severityText: string | null = null;

  for (const rl of resourceLogs) {
    const resourceAttributes = parseAttributeList(rl?.resource?.attributes);
    serviceName ||= pickServiceName(resourceAttributes);
    sessionKey ||= pickSessionKey({}, resourceAttributes);

    const scopeLogs = Array.isArray(rl?.scopeLogs) ? rl.scopeLogs : [];
    for (const sl of scopeLogs) {
      const logRecords = Array.isArray(sl?.logRecords) ? sl.logRecords : [];
      for (const record of logRecords) {
        const attrs = parseAttributeList(record?.attributes);
        sessionKey ||= pickSessionKey(attrs, resourceAttributes);

        const candidateSeverityNumber =
          typeof record?.severityNumber === 'number' ? record.severityNumber : null;
        const candidateSeverityText =
          typeof record?.severityText === 'string' && record.severityText.trim()
            ? record.severityText.trim()
            : null;

        if (candidateSeverityNumber != null && (severityNumber == null || candidateSeverityNumber > severityNumber)) {
          severityNumber = candidateSeverityNumber;
          severityText = candidateSeverityText;
        } else if (severityText == null && candidateSeverityText) {
          severityText = candidateSeverityText;
        }
      }
    }
  }

  return {
    serviceName,
    sessionKey,
    severityText,
    severityNumber
  };
}
