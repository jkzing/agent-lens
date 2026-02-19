import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from '@rstest/core';
import { useDebugViewState } from './useDebugViewState';
import type { SpanRow, TraceSummary } from './useTraceData';

function trace(id: string, name: string, service = 'nyx'): TraceSummary {
  return {
    trace_id: id,
    span_count: 1,
    duration_ns: 1,
    root_span_name: name,
    start_ns: null,
    end_ns: null,
    first_received_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
    service_names: [service],
    primary_service_name: service,
  };
}

function span(id: number, spanId: string, name: string, parentSpanId: string | null = null): SpanRow {
  return {
    id,
    received_at: new Date().toISOString(),
    trace_id: 't-1',
    span_id: spanId,
    parent_span_id: parentSpanId,
    name,
    kind: null,
    start_time_unix_nano: String(1000 + id),
    end_time_unix_nano: String(2000 + id),
    duration_ns: 100,
    attributes: null,
    status_code: null,
    resource_attributes: null,
    events: null,
    has_parent: parentSpanId != null,
    depth: parentSpanId ? 1 : 0,
  };
}

describe('useDebugViewState', () => {
  it('filters traces by agent and trace search', () => {
    const traces = [trace('t-1', 'alpha root', 'nyx'), trace('t-2', 'beta root', 'lumi')];
    let selectedTraceId: string | null = null;

    const { result, rerender } = renderHook((props: { agentFilter: string }) => useDebugViewState({
      traces,
      spans: [],
      range: 'all',
      agentFilter: props.agentFilter,
      selectedTraceId,
      setSelectedTraceId: (v) => {
        selectedTraceId = v;
      },
      selectedSpanId: null,
      setSelectedSpanId: () => {},
    }), {
      initialProps: { agentFilter: 'all' }
    });

    act(() => result.current.setTraceSearch('beta'));
    expect(result.current.filteredTraces.map((t) => t.trace_id)).toEqual(['t-2']);

    rerender({ agentFilter: 'nyx' });
    expect(result.current.filteredTraces).toEqual([]);
  });

  it('falls back selected trace/span when filtered selection disappears', () => {
    const traces = [trace('t-1', 'alpha root'), trace('t-2', 'beta root')];
    const spans = [span(1, 's-root', 'root'), span(2, 's-child', 'llm child', 's-root')];

    let selectedTraceId: string | null = 't-2';
    let selectedSpanId: number | null = 2;
    const traceCalls: Array<string | null> = [];
    const spanCalls: Array<number | null> = [];
    const setSelectedTraceId = (v: string | null) => {
      traceCalls.push(v);
      selectedTraceId = v;
    };
    const setSelectedSpanId = (v: number | null) => {
      spanCalls.push(v);
      selectedSpanId = v;
    };

    const { result, rerender } = renderHook(() => useDebugViewState({
      traces,
      spans,
      range: 'all',
      agentFilter: 'all',
      selectedTraceId,
      setSelectedTraceId,
      selectedSpanId,
      setSelectedSpanId,
    }));

    act(() => result.current.setTraceSearch('alpha'));
    rerender();
    expect(traceCalls).toContain('t-1');

    act(() => result.current.setSpanSearch('root'));
    rerender();
    expect(spanCalls).not.toContain(null);

    act(() => result.current.setSpanSearch('missing'));
    rerender();
    expect(spanCalls).toContain(null);
  });

  it('updates collapse states and clears span search on trace change', () => {
    let selectedTraceId: string | null = 't-1';

    const { result, rerender } = renderHook(() => useDebugViewState({
      traces: [trace('t-1', 'alpha')],
      spans: [span(1, 's-1', 'root')],
      range: 'all',
      agentFilter: 'all',
      selectedTraceId,
      setSelectedTraceId: (v) => {
        selectedTraceId = v;
      },
      selectedSpanId: 1,
      setSelectedSpanId: () => {},
    }));

    act(() => {
      result.current.setTracesCollapsed(true);
      result.current.setDetailCollapsed(true);
      result.current.setSpanSearch('abc');
    });
    expect(result.current.tracesCollapsed).toBe(true);
    expect(result.current.detailCollapsed).toBe(true);
    expect(result.current.spanSearch).toBe('abc');

    selectedTraceId = 't-2';
    rerender();
    expect(result.current.spanSearch).toBe('');
  });
});
