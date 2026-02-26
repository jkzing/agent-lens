import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from '@rstest/core';
import { TraceListPanel } from './TraceListPanel';

describe('TraceListPanel', () => {
  it('renders grouped traces and propagates select', () => {
    const calls: string[] = [];
    const onSelect = (traceId: string | null) => {
      if (traceId) calls.push(traceId);
    };

    render(
      <TraceListPanel
        filteredTraces={[
          {
            trace_id: 'trace-1',
            span_count: 2,
            duration_ns: 1234,
            root_span_name: 'root span',
            start_ns: null,
            end_ns: null,
            first_received_at: new Date().toISOString(),
            last_received_at: new Date().toISOString(),
            primary_service_name: 'nyx'
          }
        ]}
        tracesByAgent={{
          nyx: [
            {
              trace_id: 'trace-1',
              span_count: 2,
              duration_ns: 1234,
              root_span_name: 'root span',
              start_ns: null,
              end_ns: null,
              first_received_at: new Date().toISOString(),
              last_received_at: new Date().toISOString(),
              primary_service_name: 'nyx'
            }
          ]
        }}
        selectedTraceId={null}
        loading={false}
        traceSearch=""
        setTraceSearch={() => {}}
        traceEventTypeFilter="all"
        setTraceEventTypeFilter={() => {}}
        traceEventTypeOptions={['root span']}
        traceEventTypeCoverage={{
          rows: [{ eventType: 'root span', count: 1 }],
          uniqueEventTypes: 1,
          totalTraces: 1,
          singleSpanTraceCount: 0,
          singleSpanRatio: 0,
        }}
        setSelectedTraceId={onSelect}
        formatDurationNs={(n) => String(n)}
        toNumber={(v) => Number(v ?? 0)}
      />
    );

    expect(screen.getByTestId('trace-list-panel')).toBeTruthy();
    expect(screen.getByText(/single-span traces/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /root span/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /root span/i }));
    expect(calls).toEqual(['trace-1']);
  });
});
