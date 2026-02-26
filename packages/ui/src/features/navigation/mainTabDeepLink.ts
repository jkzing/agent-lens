import { useEffect, useState } from 'react';

export const MAIN_TABS = ['overview', 'debug', 'session-timeline', 'signals'] as const;

export type MainTab = (typeof MAIN_TABS)[number];

const MAIN_TAB_SET = new Set<string>(MAIN_TABS);
const MAIN_TAB_QUERY_KEY = 'appTab';
const LEGACY_TAB_QUERY_KEY = 'tab';
const DEFAULT_MAIN_TAB: MainTab = 'overview';

function parseMainTab(value: string | null): MainTab | null {
  if (!value) return null;
  return MAIN_TAB_SET.has(value) ? (value as MainTab) : null;
}

export function parseMainTabFromSearch(search: string): MainTab {
  const params = new URLSearchParams(search);
  const next = parseMainTab(params.get(MAIN_TAB_QUERY_KEY));
  if (next) return next;

  const legacy = parseMainTab(params.get(LEGACY_TAB_QUERY_KEY));
  if (legacy) return legacy;

  return DEFAULT_MAIN_TAB;
}

export function serializeMainTabToSearch(search: string, tab: MainTab): string {
  const params = new URLSearchParams(search);
  params.set(MAIN_TAB_QUERY_KEY, tab);
  return params.toString();
}

export function useMainTabDeepLink() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    if (typeof window === 'undefined') return DEFAULT_MAIN_TAB;
    return parseMainTabFromSearch(window.location.search);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const nextQuery = serializeMainTabToSearch(window.location.search, activeTab);
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl === currentUrl) return;
    window.history.replaceState({}, '', nextUrl);
  }, [activeTab]);

  return { activeTab, setActiveTab };
}
