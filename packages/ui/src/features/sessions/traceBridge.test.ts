import { describe, expect, it } from '@rstest/core';
import { resolveTraceBridge } from './traceBridge';

describe('resolveTraceBridge', () => {
  it('returns missing trace_id message', () => {
    const result = resolveTraceBridge(null, new Set(['trace-1']));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('does not include a trace_id');
    }
  });

  it('returns not found message', () => {
    const result = resolveTraceBridge('trace-404', new Set(['trace-1']));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Trace not found');
    }
  });

  it('returns trace when present', () => {
    const result = resolveTraceBridge('trace-1', new Set(['trace-1']));
    expect(result).toEqual({ ok: true, traceId: 'trace-1' });
  });
});
