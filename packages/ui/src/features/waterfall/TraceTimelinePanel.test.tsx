import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from '@rstest/core';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TraceTimelinePanel } from './TraceTimelinePanel';

const trace = {
  trace_id: 'trace-1',
  span_count: 2,
  duration_ns: 2_000_000,
  root_span_name: 'root span',
  start_ns: null,
  end_ns: null,
  first_received_at: new Date().toISOString(),
  last_received_at: new Date().toISOString(),
  primary_service_name: 'nyx'
};

const spans = [
  {
    id: 1,
    received_at: new Date().toISOString(),
    trace_id: 'trace-1',
    span_id: 's1',
    parent_span_id: null,
    name: 'root',
    kind: null,
    start_time_unix_nano: '1000',
    end_time_unix_nano: '2000',
    duration_ns: 1000,
    attributes: '{}',
    status_code: 0,
    resource_attributes: '{}',
    events: '[]',
    has_parent: false,
    depth: 0,
  },
  {
    id: 2,
    received_at: new Date().toISOString(),
    trace_id: 'trace-1',
    span_id: 's2',
    parent_span_id: 's1',
    name: 'tool-call',
    kind: null,
    start_time_unix_nano: '1200',
    end_time_unix_nano: '1800',
    duration_ns: 600,
    attributes: '{"tool":true}',
    status_code: 0,
    resource_attributes: '{}',
    events: '[]',
    has_parent: true,
    depth: 1,
  },
];

describe('TraceTimelinePanel', () => {
  it('renders timeline panel and supports span + filter interactions', () => {
    const selected: number[] = [];
    const setSpanSearchCalls: string[] = [];
    const openSignalsCalls: number[] = [];

    render(
      <TooltipProvider>
        <TraceTimelinePanel
          tracesCollapsed={false}
          setTracesCollapsed={() => {}}
          detailCollapsed={false}
          setDetailCollapsed={() => {}}
          selectedTrace={trace}
          setError={() => {}}
          exportTrace={async () => {}}
          onOpenSignals={() => openSignalsCalls.push(1)}
          spanSearch="tool"
          setSpanSearch={(v) => setSpanSearchCalls.push(v)}
          spanEventTypeFilter="all"
          setSpanEventTypeFilter={() => {}}
          spanEventTypeOptions={["root", "tool-call"]}
          filteredSpans={[spans[1]]}
          spans={spans}
          selectedSpanId={null}
          setSelectedSpanId={(id) => { if (id != null) selected.push(id); }}
          traceCostStats={{ input: 0, output: 0, cost: 0, modelRows: [] }}
          suspiciousLoopSpanIds={new Set<number>()}
          parseJsonObject={(input) => (input ? JSON.parse(input) : {})}
          detectSpanType={(span) => (span.name?.includes('tool') ? 'tool' : 'internal')}
          timelineMeta={{ minStart: 1000, maxEnd: 2000, total: 1000 }}
          ticks={[0, 500, 1000]}
          timelineCanvasWidth={980}
          timelineRowHeight={32}
          timelineHeaderHeight={32}
          nameColumnWidth={260}
          formatOffsetMs={(v) => `${v}ns`}
          formatDurationNs={(v) => `${v}`}
          toNumber={(v) => Number(v ?? 0)}
          formatTick={(v) => `${v}`}
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('trace-timeline-panel')).toBeTruthy();
    expect(screen.getByRole('button', { name: /tool-call/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /tool-call/i }));
    expect(selected).toEqual([2]);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(setSpanSearchCalls).toContain('');

    fireEvent.click(screen.getByRole('button', { name: 'Open in Signals' }));
    expect(openSignalsCalls).toEqual([1]);
  });
});
