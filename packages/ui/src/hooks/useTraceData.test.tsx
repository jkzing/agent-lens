import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { useTraceData } from './useTraceData';

describe('useTraceData', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // no-op
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads traces and selects first trace/span', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/traces?')) {
        return {
          ok: true,
          json: async () => ({ items: [{ trace_id: 't-1', span_count: 1, duration_ns: 1000, root_span_name: 'root', start_ns: null, end_ns: null, first_received_at: new Date().toISOString(), last_received_at: new Date().toISOString() }] })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [{ id: 11, received_at: new Date().toISOString(), trace_id: 't-1', span_id: 's-1', parent_span_id: null, name: 'root', kind: null, start_time_unix_nano: null, end_time_unix_nano: null, duration_ns: 10, attributes: null, status_code: null, resource_attributes: null, events: null, has_parent: false, depth: 0 }] })
      } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useTraceData(false));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedTraceId).toBe('t-1');
    expect(result.current.selectedSpanId).toBe(11);
    expect(result.current.error).toBeNull();
  });

  it('surfaces load error when trace list request fails', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch;

    const { result } = renderHook(() => useTraceData(false));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.error).toContain('Load traces failed: 500'));
    expect(result.current.traces).toEqual([]);
  });

  it('updates selected span when selecting another trace', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/traces?')) {
        return {
          ok: true,
          json: async () => ({ items: [
            { trace_id: 't-1', span_count: 1, duration_ns: 10, root_span_name: 'one', start_ns: null, end_ns: null, first_received_at: new Date().toISOString(), last_received_at: new Date().toISOString() },
            { trace_id: 't-2', span_count: 1, duration_ns: 20, root_span_name: 'two', start_ns: null, end_ns: null, first_received_at: new Date().toISOString(), last_received_at: new Date().toISOString() }
          ] })
        } as Response;
      }
      if (url.includes('/api/traces/t-1?')) {
        return { ok: true, json: async () => ({ items: [{ id: 101, received_at: new Date().toISOString(), trace_id: 't-1', span_id: 's-1', parent_span_id: null, name: 's1', kind: null, start_time_unix_nano: null, end_time_unix_nano: null, duration_ns: 1, attributes: null, status_code: null, resource_attributes: null, events: null, has_parent: false, depth: 0 }] }) } as Response;
      }
      return { ok: true, json: async () => ({ items: [{ id: 202, received_at: new Date().toISOString(), trace_id: 't-2', span_id: 's-2', parent_span_id: null, name: 's2', kind: null, start_time_unix_nano: null, end_time_unix_nano: null, duration_ns: 1, attributes: null, status_code: null, resource_attributes: null, events: null, has_parent: false, depth: 0 }] }) } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useTraceData(false));
    await waitFor(() => expect(result.current.selectedSpanId).toBe(101));

    act(() => result.current.setSelectedTraceId('t-2'));
    await waitFor(() => expect(result.current.selectedTraceId).toBe('t-2'));
    await waitFor(() => expect(result.current.selectedSpanId).toBe(202));
  });
});
