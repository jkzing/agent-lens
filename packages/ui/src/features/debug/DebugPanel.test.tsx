import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { DebugPanel } from './DebugPanel';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';

function makeTrace(traceId: string): TraceSummary {
  return {
    trace_id: traceId,
    span_count: 1,
    duration_ns: 1_200_000,
    root_span_name: `root-${traceId}`,
    start_ns: null,
    end_ns: null,
    first_received_at: new Date().toISOString(),
    last_received_at: new Date().toISOString(),
    service_names: ['nyx'],
    primary_service_name: 'nyx',
    input_tokens: 0,
    output_tokens: 0,
  };
}

function makeSpan(id: number): SpanRow {
  return {
    id,
    received_at: new Date().toISOString(),
    trace_id: 'trace-1',
    span_id: `span-${id}`,
    parent_span_id: null,
    name: `span-${id}`,
    kind: 1,
    start_time_unix_nano: '1000',
    end_time_unix_nano: '2000',
    duration_ns: 1000,
    attributes: '{}',
    status_code: 0,
    resource_attributes: '{}',
    events: '[]',
    has_parent: false,
    depth: 0,
  };
}

describe('DebugPanel', () => {
  afterEach(() => cleanup());

  it('renders debug panel smoke', () => {
    const trace = makeTrace('trace-1');
    const span = makeSpan(1);

    render(
      <TooltipProvider>
        <DebugPanel
        tracesCollapsed={false}
        setTracesCollapsed={() => {}}
        detailCollapsed={false}
        setDetailCollapsed={() => {}}
        filteredTraces={[trace]}
        tracesByAgent={{ nyx: [trace] }}
        loading={false}
        traceSearch=""
        setTraceSearch={() => {}}
        traceEventTypeFilter="all"
        setTraceEventTypeFilter={() => {}}
        traceEventTypeOptions={[trace.root_span_name]}
        traceEventTypeCoverage={{ rows: [{ eventType: trace.root_span_name, count: 1 }], uniqueEventTypes: 1 }}
        selectedTraceId={trace.trace_id}
        setSelectedTraceId={() => {}}
        selectedTrace={trace}
        setError={() => {}}
        exportTrace={async () => {}}
        spanSearch=""
        setSpanSearch={() => {}}
        spanEventTypeFilter="all"
        setSpanEventTypeFilter={() => {}}
        spanEventTypeOptions={[span.name || 'unknown']}
        filteredSpans={[span]}
        spans={[span]}
        selectedSpanId={span.id}
        setSelectedSpanId={() => {}}
        selectedSpan={span}
        selectedSpanEvents={[]}
        selectedSpanContextRows={[]}
        traceCostStats={{ input: 0, output: 0, cost: 0, modelRows: [] }}
        suspiciousLoopSpanIds={new Set<number>()}
        parseJsonObject={() => ({})}
        detectSpanType={() => 'internal'}
        timelineMeta={{ minStart: 0, maxEnd: 1, total: 1 }}
        ticks={[0, 1]}
        timelineCanvasWidth={980}
        timelineRowHeight={32}
        timelineHeaderHeight={32}
        nameColumnWidth={260}
        formatOffsetMs={() => '0.00 ms'}
        formatDurationNs={() => '1.00 ms'}
        toNumber={() => 0}
        formatTick={() => '0ms'}
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('debug-panel')).toBeTruthy();
    expect(screen.getByTestId('trace-list-panel')).toBeTruthy();
    expect(screen.getByTestId('trace-timeline-panel')).toBeTruthy();
    expect(screen.getByTestId('trace-detail-panel')).toBeTruthy();
  });

  it('wires key callbacks for trace select, collapse toggle, and filter updates', () => {
    const trace = makeTrace('trace-1');
    const span = makeSpan(1);
    const selectedTraceCalls: string[] = [];
    const traceSearchCalls: string[] = [];
    const spanSearchCalls: string[] = [];
    const collapseCalls: boolean[] = [];

    render(
      <TooltipProvider>
        <DebugPanel
        tracesCollapsed={false}
        setTracesCollapsed={(next) => collapseCalls.push(typeof next === 'function' ? next(false) : next)}
        detailCollapsed={false}
        setDetailCollapsed={() => {}}
        filteredTraces={[trace]}
        tracesByAgent={{ nyx: [trace] }}
        loading={false}
        traceSearch=""
        setTraceSearch={(value) => traceSearchCalls.push(value)}
        traceEventTypeFilter="all"
        setTraceEventTypeFilter={() => {}}
        traceEventTypeOptions={[trace.root_span_name]}
        traceEventTypeCoverage={{ rows: [{ eventType: trace.root_span_name, count: 1 }], uniqueEventTypes: 1 }}
        selectedTraceId={null}
        setSelectedTraceId={(traceId) => selectedTraceCalls.push(traceId)}
        selectedTrace={trace}
        setError={() => {}}
        exportTrace={async () => {}}
        spanSearch=""
        setSpanSearch={(value) => spanSearchCalls.push(value)}
        spanEventTypeFilter="all"
        setSpanEventTypeFilter={() => {}}
        spanEventTypeOptions={[span.name || 'unknown']}
        filteredSpans={[span]}
        spans={[span]}
        selectedSpanId={null}
        setSelectedSpanId={() => {}}
        selectedSpan={span}
        selectedSpanEvents={[]}
        selectedSpanContextRows={[]}
        traceCostStats={{ input: 0, output: 0, cost: 0, modelRows: [] }}
        suspiciousLoopSpanIds={new Set<number>()}
        parseJsonObject={() => ({})}
        detectSpanType={() => 'internal'}
        timelineMeta={{ minStart: 0, maxEnd: 1, total: 1 }}
        ticks={[0, 1]}
        timelineCanvasWidth={980}
        timelineRowHeight={32}
        timelineHeaderHeight={32}
        nameColumnWidth={260}
        formatOffsetMs={() => '0.00 ms'}
        formatDurationNs={() => '1.00 ms'}
        toNumber={() => 0}
        formatTick={() => '0ms'}
        />
      </TooltipProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('Search root span name...'), { target: { value: 'hello' } });
    fireEvent.change(screen.getByPlaceholderText('Filter spans by name...'), { target: { value: 'world' } });
    fireEvent.click(screen.getByRole('button', { name: /root-trace-1/i }));

    const timeline = screen.getByTestId('trace-timeline-panel');
    fireEvent.click(within(timeline).getAllByRole('button')[0]);

    expect(traceSearchCalls).toEqual(['hello']);
    expect(spanSearchCalls).toEqual(['world']);
    expect(selectedTraceCalls).toEqual(['trace-1']);
    expect(collapseCalls).toEqual([true]);
  });
});
