import { describe, expect, it } from '@rstest/core';
import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';
import { buildEventTypeCoverage, buildEventTypeOptions, buildSpanEventTypeOptions, filterSpansForTimeline, filterTracesByEventType } from './traceFilters';

function makeTrace(trace_id: string, root_span_name: string): TraceSummary {
  return {
    trace_id,
    span_count: 1,
    duration_ns: 1,
    root_span_name,
    start_ns: null,
    end_ns: null,
    first_received_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
  };
}

function makeSpan(id: number, span_id: string, name: string, parent_span_id: string | null = null): SpanRow {
  return {
    id,
    received_at: new Date().toISOString(),
    trace_id: 't-1',
    span_id,
    parent_span_id,
    name,
    kind: null,
    start_time_unix_nano: '1',
    end_time_unix_nano: '2',
    duration_ns: 1,
    attributes: '{}',
    status_code: 0,
    resource_attributes: '{}',
    events: '[]',
    has_parent: parent_span_id != null,
    depth: parent_span_id ? 1 : 0,
  };
}

describe('traceFilters', () => {
  it('builds event-type coverage sorted by count', () => {
    const traces = [
      makeTrace('t1', 'agent.run'),
      makeTrace('t2', 'agent.run'),
      makeTrace('t3', 'tool.call'),
    ];

    const coverage = buildEventTypeCoverage(traces);
    expect(coverage.uniqueEventTypes).toBe(2);
    expect(coverage.rows).toEqual([
      { eventType: 'agent.run', count: 2 },
      { eventType: 'tool.call', count: 1 },
    ]);
    expect(coverage.totalTraces).toBe(3);
    expect(coverage.singleSpanTraceCount).toBe(3);
    expect(coverage.singleSpanRatio).toBe(1);
    expect(buildEventTypeOptions(traces)).toEqual(['agent.run', 'tool.call']);
  });

  it('filters traces by selected root span name', () => {
    const traces = [makeTrace('t1', 'agent.run'), makeTrace('t2', 'tool.call')];
    expect(filterTracesByEventType(traces, 'all').map((t) => t.trace_id)).toEqual(['t1', 't2']);
    expect(filterTracesByEventType(traces, 'agent.run').map((t) => t.trace_id)).toEqual(['t1']);
  });

  it('computes single-span ratio using span_count', () => {
    const traces = [
      makeTrace('t1', 'agent.run'),
      { ...makeTrace('t2', 'agent.run'), span_count: 2 },
      { ...makeTrace('t3', 'tool.call'), span_count: 3 },
    ];

    const coverage = buildEventTypeCoverage(traces);
    expect(coverage.totalTraces).toBe(3);
    expect(coverage.singleSpanTraceCount).toBe(1);
    expect(coverage.singleSpanRatio).toBeCloseTo(1 / 3);
  });

  it('keeps ancestor visibility for text search and supports span event-type filter', () => {
    const spans = [
      makeSpan(1, 'root', 'request'),
      makeSpan(2, 'child-1', 'tool.call', 'root'),
      makeSpan(3, 'child-2', 'llm.generate', 'root'),
    ];

    expect(filterSpansForTimeline(spans, 'tool', 'all').map((s) => s.id)).toEqual([1, 2]);
    expect(filterSpansForTimeline(spans, '', 'tool.call').map((s) => s.id)).toEqual([2]);
    expect(buildSpanEventTypeOptions(spans)).toEqual(['llm.generate', 'request', 'tool.call']);
  });
});
