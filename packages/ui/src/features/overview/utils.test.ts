import { describe, expect, it } from '@rstest/core';
import type { SpanRow } from '@/hooks/useTraceData';
import { estimateCost, getSpanModelInfo } from './utils';

function makeSpan(overrides: Partial<SpanRow>): SpanRow {
  return {
    id: 1,
    received_at: new Date().toISOString(),
    trace_id: 'trace-1',
    span_id: 'span-1',
    parent_span_id: null,
    name: 'llm.call',
    kind: null,
    start_time_unix_nano: null,
    end_time_unix_nano: null,
    duration_ns: null,
    attributes: null,
    status_code: null,
    resource_attributes: null,
    events: null,
    has_parent: false,
    depth: 0,
    ...overrides
  };
}

describe('overview utils', () => {
  it('resolves model/provider and applies pricing rule', () => {
    const span = makeSpan({
      attributes: JSON.stringify({
        'gen_ai.provider': 'openai',
        'gen_ai.request.model': 'gpt-4.1'
      })
    });

    const info = getSpanModelInfo(span);
    const cost = estimateCost(1000, 500, info.provider, info.model);

    expect(info).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    expect(cost).toBeCloseTo(0.006, 8);
  });
});
