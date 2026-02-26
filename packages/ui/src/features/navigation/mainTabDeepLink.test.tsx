import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { parseMainTabFromSearch, serializeMainTabToSearch, useMainTabDeepLink } from './mainTabDeepLink';

describe('mainTabDeepLink', () => {
  const originalReplaceState = window.history.replaceState;

  afterEach(() => {
    cleanup();
    window.history.replaceState = originalReplaceState;
    window.history.replaceState({}, '', '/');
  });

  it('parses app-level tab first, then legacy tab, and falls back safely', () => {
    expect(parseMainTabFromSearch('?appTab=signals&tab=logs')).toBe('signals');
    expect(parseMainTabFromSearch('?tab=debug')).toBe('debug');
    expect(parseMainTabFromSearch('?appTab=unknown&tab=logs')).toBe('overview');
    expect(parseMainTabFromSearch('?appTab=unknown&tab=unknown')).toBe('overview');
  });

  it('serializes active app tab while preserving existing params', () => {
    const query = serializeMainTabToSearch('?service=svc-a&tab=logs&page=2', 'signals');
    const params = new URLSearchParams(query);

    expect(params.get('appTab')).toBe('signals');
    expect(params.get('service')).toBe('svc-a');
    expect(params.get('tab')).toBe('logs');
    expect(params.get('page')).toBe('2');
  });

  it('hydrates from URL and preserves existing query params when navigating tabs', () => {
    const replaceCalls: string[] = [];
    window.history.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => {
      replaceCalls.push(String(url || ''));
      return originalReplaceState.call(window.history, data as any, unused, url as any);
    }) as History['replaceState'];

    window.history.pushState({}, '', '/?service=svc-a&tab=logs&page=3&limit=10&appTab=signals#hash');

    function Harness() {
      const { activeTab, setActiveTab } = useMainTabDeepLink();
      return (
        <div>
          <div data-testid="active-tab">{activeTab}</div>
          <button type="button" onClick={() => setActiveTab('debug')}>
            go-debug
          </button>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId('active-tab').textContent).toBe('signals');

    fireEvent.click(screen.getByRole('button', { name: 'go-debug' }));

    return waitFor(() => {
      const lastUrl = replaceCalls.at(-1) || '';
      expect(lastUrl).toContain('appTab=debug');
      expect(lastUrl).toContain('service=svc-a');
      expect(lastUrl).toContain('tab=logs');
      expect(lastUrl).toContain('page=3');
      expect(lastUrl).toContain('limit=10');
      expect(lastUrl).toContain('#hash');
    });
  });
});
