import { describe, expect, it } from '@rstest/core';
import type { SpanRow } from '@/hooks/useTraceData';
import { deriveOverviewData } from './useOverviewData';

function makeSpan(id: number, overrides: Partial<SpanRow>): SpanRow {
  return {
    id,
    received_at: new Date().toISOString(),
    trace_id: 'trace-1',
    span_id: `span-${id}`,
    parent_span_id: null,
    name: `span-${id}`,
    kind: null,
    start_time_unix_nano: String(id * 1_000_000),
    end_time_unix_nano: String(id * 1_000_000 + 1_000),
    duration_ns: 1_000,
    attributes: JSON.stringify({}),
    status_code: 1,
    resource_attributes: null,
    events: null,
    has_parent: false,
    depth: 0,
    ...overrides
  };
}

describe('deriveOverviewData', () => {
  it('builds and filters overview data with stable kpis', () => {
    const now = Date.now();
    const spans: SpanRow[] = [
      makeSpan(1, {
        name: 'human.request',
        received_at: new Date(now - 2 * 60 * 1000).toISOString(),
        attributes: JSON.stringify({ input: 'hello', output: 'ok' })
      }),
      makeSpan(2, {
        name: 'nyx.tool.call',
        parent_span_id: 'span-1',
        received_at: new Date(now - 10 * 60 * 1000).toISOString(),
        end_time_unix_nano: null,
        status_code: 0,
        attributes: JSON.stringify({ 'tool.input': 'lookup', 'tool.output': 'done' })
      })
    ];

    const result = deriveOverviewData({
      spans,
      overviewActorFilter: 'Nyx',
      overviewTimeFilter: '1h',
      overviewDataMode: 'live',
      nowMs: now
    });

    expect(result.effectiveOverviewMode).toBe('live');
    expect(result.filteredOverviewSteps).toHaveLength(1);
    expect(result.filteredOverviewSteps[0].toLane).toBe('Nyx');
    expect(result.overviewKpis).toEqual({
      total: 1,
      successRate: 0,
      avgDuration: '1.00 μs',
      blocked: 1
    });
  });
});
