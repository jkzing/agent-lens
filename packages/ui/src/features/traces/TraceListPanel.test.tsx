import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TraceListPanel } from './TraceListPanel';

describe('TraceListPanel', () => {
  it('renders grouped traces and propagates select', () => {
    const onSelect = vi.fn();
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
        setSelectedTraceId={onSelect}
        formatDurationNs={(n) => String(n)}
        toNumber={(v) => Number(v ?? 0)}
      />
    );

    expect(screen.getByTestId('trace-list-panel')).toBeTruthy();
    expect(screen.getByText('root span')).toBeTruthy();

    fireEvent.click(screen.getByText('root span'));
    expect(onSelect).toHaveBeenCalledWith('trace-1');
  });
});
