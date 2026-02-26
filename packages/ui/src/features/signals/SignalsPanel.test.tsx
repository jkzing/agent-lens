import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { SignalsPanel } from './SignalsPanel';

describe('SignalsPanel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
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

  it('passes filters through query params', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return {
        ok: true,
        json: async () => ({ items: [], pagination: { limit: 20, offset: 0, total: 0 } })
      } as Response;
    }) as typeof fetch;

    render(<SignalsPanel />);
    await waitFor(() => expect(urls.length).toBeGreaterThan(1));

    fireEvent.change(screen.getByLabelText('Filter service'), { target: { value: 'svc-a' } });
    fireEvent.change(screen.getByLabelText('Filter session key'), { target: { value: 'sess-1' } });
    fireEvent.change(screen.getByLabelText('Filter parse status'), { target: { value: 'error' } });
    fireEvent.change(screen.getByLabelText('Filter metric name'), { target: { value: 'latency_ms' } });
    fireEvent.change(screen.getByLabelText('Filter severity'), { target: { value: 'WARN' } });

    await waitFor(() => {
      const lastMetrics = urls.filter((url) => url.includes('/api/metrics/records?')).at(-1) || '';
      const lastLogs = urls.filter((url) => url.includes('/api/logs/records?')).at(-1) || '';
      expect(lastMetrics).toContain('service=svc-a');
      expect(lastMetrics).toContain('sessionKey=sess-1');
      expect(lastMetrics).toContain('parseStatus=error');
      expect(lastMetrics).toContain('metricName=latency_ms');
      expect(lastLogs).toContain('severity=WARN');
    });
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
