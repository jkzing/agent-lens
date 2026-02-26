import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { SignalsPanel } from './SignalsPanel';

describe('SignalsPanel', () => {
  const originalFetch = globalThis.fetch;
  const originalReplaceState = window.history.replaceState;

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.history.replaceState = originalReplaceState;
    window.history.replaceState({}, '', '/');
  });

  it('loads metrics/logs and renders detail panel', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/metrics/records?')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 11,
                received_at: '2026-02-26T04:00:00.000Z',
                content_type: 'application/json',
                parse_status: 'ok',
                parse_error: null,
                item_count: 2,
                service_name: 'svc-a',
                session_key: 'sess-1',
                metric_names: 'requests_total',
                payload: '{"foo":"bar"}'
              }
            ],
            pagination: { limit: 20, offset: 0, total: 1 }
          })
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          items: [
            {
              id: 21,
              received_at: '2026-02-26T04:00:00.000Z',
              content_type: 'application/json',
              parse_status: 'ok',
              parse_error: null,
              item_count: 1,
              service_name: 'svc-a',
              session_key: 'sess-1',
              severity_text: 'INFO',
              severity_number: 9,
              payload: '{"log":"ok"}'
            }
          ],
          pagination: { limit: 20, offset: 0, total: 1 }
        })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);

    await waitFor(() => expect(screen.getByText('Metrics records')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('metrics-record-detail')).toBeTruthy());

    expect(screen.getByTestId('metrics-record-detail').textContent).toContain('requests_total');
    expect(screen.getByTestId('logs-record-detail').textContent).toContain('INFO');
    expect(screen.getAllByText('Raw payload preview').length).toBeGreaterThan(0);
  });

  it('hydrates filters from URL and persists updates', async () => {
    const replaceCalls: string[] = [];
    window.history.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => {
      replaceCalls.push(String(url || ''));
      return originalReplaceState.call(window.history, data as any, unused, url as any);
    }) as History['replaceState'];
    window.history.pushState({}, '', '/?service=url-svc&sessionKey=url-sess&parseStatus=error&tab=logs&page=3&limit=10&metricName=cpu&severity=WARN');

    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const query = url.split('?')[1] || '';
      const params = new URLSearchParams(query);
      return {
        ok: true,
        json: async () => ({
          items: [],
          pagination: {
            limit: Number(params.get('limit') || 20),
            offset: Number(params.get('offset') || 0),
            total: 100
          }
        })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);

    await waitFor(() => {
      const metric = urls.find((url) => url.includes('/api/metrics/records?')) || '';
      const logs = urls.find((url) => url.includes('/api/logs/records?')) || '';
      expect(metric).toContain('service=url-svc');
      expect(metric).toContain('sessionKey=url-sess');
      expect(metric).toContain('parseStatus=error');
      expect(metric).toContain('metricName=cpu');
      expect(logs).toContain('severity=WARN');
      expect(logs).toContain('limit=10');
      expect(logs).toContain('offset=20');
    });

    fireEvent.click(screen.getByRole('button', { name: 'metrics' }));
    fireEvent.change(screen.getByLabelText('Filter service'), { target: { value: 'svc-a' } });

    await waitFor(() => {
      const lastUrl = replaceCalls.at(-1) || '';
      expect(lastUrl).toContain('service=svc-a');
      expect(lastUrl).toContain('tab=metrics');
      expect(lastUrl).toContain('page=1');
      expect(lastUrl).toContain('limit=20');
    });
  });

  it('preserves URL-derived filter state across remount', async () => {
    window.history.replaceState({}, '', '/?service=sticky-svc&sessionKey=sticky-sess&tab=logs&page=2&limit=10');

    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({ items: [], pagination: { limit: 10, offset: 10, total: 20 } })
      } as Response;
    }) as typeof fetch;

    const { unmount } = render(<SignalsPanel />);
    await waitFor(() => expect(screen.getByDisplayValue('sticky-svc')).toBeTruthy());
    unmount();

    render(<SignalsPanel />);
    await waitFor(() => expect(screen.getByDisplayValue('sticky-svc')).toBeTruthy());
    expect((screen.getByLabelText('Filter session key') as HTMLInputElement).value).toBe('sticky-sess');
  });

  it('supports reset filters behavior and empty state hint', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return {
        ok: true,
        json: async () => ({ items: [], pagination: { limit: 20, offset: 40, total: 0 } })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);

    fireEvent.change(screen.getByLabelText('Filter service'), { target: { value: 'svc-a' } });
    fireEvent.change(screen.getByLabelText('Filter session key'), { target: { value: 'sess-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Filter service') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Filter session key') as HTMLInputElement).value).toBe('');
      const latestMetric = urls.filter((url) => url.includes('/api/metrics/records?')).at(-1) || '';
      expect(latestMetric).toContain('offset=0');
      expect(latestMetric).not.toContain('service=svc-a');
    });

    expect(screen.getAllByText(/Tip: set service\/session\/time filters/).length).toBeGreaterThan(0);
  });

  it('renders empty and error states', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/metrics/records?')) {
        return { ok: false, status: 500 } as Response;
      }
      return {
        ok: true,
        json: async () => ({ items: [], pagination: { limit: 20, offset: 0, total: 0 } })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);

    await waitFor(() => expect(screen.getByText('Load metrics records failed: 500')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('No logs records found.')).toBeTruthy());
  });

  it('supports basic pagination behavior', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return {
        ok: true,
        json: async () => ({
          items: [
            {
              id: 1,
              received_at: '2026-02-26T04:00:00.000Z',
              content_type: 'application/json',
              parse_status: 'ok',
              parse_error: null,
              item_count: 2,
              service_name: 'svc-a',
              session_key: 'sess-1',
              metric_names: 'requests_total',
              payload: '{}'
            }
          ],
          pagination: {
            limit: url.includes('limit=10') ? 10 : 20,
            offset: url.includes('offset=20') ? 20 : 0,
            total: 100
          }
        })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);
    await waitFor(() => expect(screen.getByLabelText('metrics page size')).toBeTruthy());

    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    fireEvent.change(screen.getByLabelText('metrics page size'), { target: { value: '10' } });

    await waitFor(() => {
      const metricUrls = urls.filter((url) => url.includes('/api/metrics/records?'));
      expect(metricUrls.some((url) => url.includes('offset=20'))).toBeTruthy();
      expect(metricUrls.some((url) => url.includes('limit=10'))).toBeTruthy();
    });
  });
});
