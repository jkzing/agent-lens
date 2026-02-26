import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { useSessionTimelineData } from './useSessionTimelineData';

describe('useSessionTimelineData', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads overview, auto-selects a session, and loads timeline', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/sessions/overview?')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                session_key: 'sess-1',
                first_seen_unix_nano: 1,
                last_seen_unix_nano: 2,
                span_count: 2,
                trace_count: 1,
                event_types: ['message.sent'],
                channel: 'telegram'
              }
            ],
            pagination: { limit: 50, offset: 0, total: 1 }
          })
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          items: [
            {
              trace_id: 'trace-1',
              span_id: 'span-1',
              name: 'event-1',
              start_time_unix_nano: 1,
              end_time_unix_nano: 2,
              duration_ns: 1,
              service_name: 'svc',
              channel: 'telegram',
              state: 'done',
              outcome: 'ok',
              attributes: null,
              resource_attributes: null
            }
          ],
          pagination: { limit: 200, offset: 0, total: 1 }
        })
      } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useSessionTimelineData());

    await waitFor(() => expect(result.current.overviewLoading).toBe(false));
    await waitFor(() => expect(result.current.timelineLoading).toBe(false));

    expect(result.current.selectedSessionKey).toBe('sess-1');
    expect(result.current.timelineItems).toHaveLength(1);
    expect(result.current.eventTypeOptions).toEqual(['message.sent']);
  });

  it('debounces overview reload when query changes', async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith('/api/sessions/overview?')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                session_key: 'sess-1',
                first_seen_unix_nano: 1,
                last_seen_unix_nano: 2,
                span_count: 2,
                trace_count: 1,
                event_types: ['message.sent'],
                channel: 'telegram'
              }
            ],
            pagination: { limit: 50, offset: 0, total: 1 }
          })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [], pagination: { limit: 200, offset: 0, total: 0 } })
      } as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useSessionTimelineData());
    await waitFor(() => expect(result.current.overviewLoading).toBe(false));

    const initialCount = requested.filter((url) => url.startsWith('/api/sessions/overview?')).length;

    act(() => result.current.setQuery('nyx'));

    await new Promise((resolve) => setTimeout(resolve, 50));
    const beforeDebounceCount = requested.filter((url) => url.startsWith('/api/sessions/overview?')).length;
    expect(beforeDebounceCount).toBe(initialCount);

    await waitFor(() => {
      const matched = requested.filter((url) => url.startsWith('/api/sessions/overview?') && url.includes('q=nyx'));
      expect(matched.length).toBeGreaterThan(0);
    }, { timeout: 1000 });
  });
});
