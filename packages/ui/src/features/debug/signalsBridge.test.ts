import { describe, expect, it } from '@rstest/core';
import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';
import { buildDebugSignalsPrefill } from './signalsBridge';

function makeTrace(): TraceSummary {
  return {
    trace_id: 't-1',
    span_count: 1,
    duration_ns: 100,
    root_span_name: 'root',
    start_ns: null,
    end_ns: null,
    first_received_at: '2026-02-26T05:00:00.000Z',
    last_received_at: '2026-02-26T05:01:00.000Z',
    service_names: ['svc-fallback'],
    primary_service_name: 'svc-primary',
    input_tokens: 0,
    output_tokens: 0
  };
}

function makeSpan(): SpanRow {
  return {
    id: 1,
    received_at: '2026-02-26T05:00:00.000Z',
    trace_id: 't-1',
    span_id: 's-1',
    parent_span_id: null,
    name: 'span',
    kind: 1,
    start_time_unix_nano: '1740546000000000000',
    end_time_unix_nano: '1740546060000000000',
    duration_ns: 100,
    attributes: '{"session.key":"sess-1"}',
    status_code: 0,
    resource_attributes: '{"service.name":"svc-span"}',
    events: '[]',
    has_parent: false,
    depth: 0
  };
}

describe('buildDebugSignalsPrefill', () => {
  it('extracts service/session/time from span context', () => {
    const result = buildDebugSignalsPrefill(makeTrace(), makeSpan());
    expect(result.service).toBe('svc-span');
    expect(result.sessionKey).toBe('sess-1');
    expect(result.from).toBe('2025-02-26T05:00:00.000Z');
    expect(result.to).toBe('2025-02-26T05:01:00.000Z');
  });

  it('falls back safely when span context is missing', () => {
    const trace = makeTrace();
    const result = buildDebugSignalsPrefill(trace, null);
    expect(result.service).toBe('svc-primary');
    expect(result.sessionKey).toBeUndefined();
    expect(result.from).toBe(trace.first_received_at);
    expect(result.to).toBe(trace.last_received_at);
  });
});
