import { render, screen } from '@testing-library/react';
import { describe, expect, it } from '@rstest/core';
import { TraceDetailPanel } from './TraceDetailPanel';

const baseSpan = {
  id: 42,
  received_at: new Date().toISOString(),
  trace_id: 'trace-1',
  span_id: 'span-1',
  parent_span_id: null,
  name: 'tool-call',
  kind: null,
  start_time_unix_nano: '1000',
  end_time_unix_nano: '2000',
  duration_ns: 1000,
  attributes: '{"tool.input":{"q":"hello"},"gen_ai.usage.input_tokens":7,"gen_ai.usage.output_tokens":9}',
  status_code: 0,
  resource_attributes: '{"service.name":"agent-lens"}',
  events: '[]',
  has_parent: false,
  depth: 0,
} as const;

describe('TraceDetailPanel', () => {
  it('smoke renders selected span details', () => {
    render(
      <TraceDetailPanel
        selectedSpan={baseSpan}
        selectedSpanEvents={[{ name: 'gen_ai.content.prompt', timeUnixNano: 1500, attributes: { role: 'user' } }]}
        selectedSpanContextRows={[{ label: 'model', value: 'gpt-5' }]}
        parseJsonObject={(v) => (v ? JSON.parse(v) : {})}
        detectSpanType={() => 'tool'}
        formatDurationNs={(v) => `${v}ns`}
        formatOffsetMs={(v) => `${v}ns`}
      />
    );

    expect(screen.getByTestId('trace-detail-panel')).toBeTruthy();
    expect(screen.getByText('name: tool-call')).toBeTruthy();
    expect(screen.getByText('type: tool')).toBeTruthy();
    expect(screen.getByText('Events (1)')).toBeTruthy();
    expect(screen.getByText('gen_ai.content.prompt')).toBeTruthy();
    expect(screen.getByText('offset: 500ns')).toBeTruthy();
  });

  it('shows empty-state hints when no events or selected span', () => {
    const { rerender } = render(
      <TraceDetailPanel
        selectedSpan={baseSpan}
        selectedSpanEvents={[]}
        selectedSpanContextRows={[]}
        parseJsonObject={(v) => (v ? JSON.parse(v) : {})}
        detectSpanType={() => 'tool'}
        formatDurationNs={(v) => `${v}ns`}
        formatOffsetMs={(v) => `${v}ns`}
      />
    );

    expect(screen.getByText('Events (0)')).toBeTruthy();
    expect(screen.getAllByText('(none)').length).toBeGreaterThan(0);

    rerender(
      <TraceDetailPanel
        selectedSpan={null}
        selectedSpanEvents={[]}
        selectedSpanContextRows={[]}
        parseJsonObject={(v) => (v ? JSON.parse(v) : {})}
        detectSpanType={() => 'tool'}
        formatDurationNs={(v) => `${v}ns`}
        formatOffsetMs={(v) => `${v}ns`}
      />
    );

    expect(screen.getByText('Click a span in timeline to inspect details.')).toBeTruthy();
  });
});
