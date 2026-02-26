import { useCallback, useEffect, useMemo, useState } from 'react';

export type SessionOverviewItem = {
  session_key: string;
  first_seen_unix_nano: number | null;
  last_seen_unix_nano: number | null;
  span_count: number;
  trace_count: number;
  event_types: string[];
  channel: string | null;
};

export type SessionTimelineItem = {
  trace_id: string | null;
  span_id: string | null;
  name: string | null;
  start_time_unix_nano: number | null;
  end_time_unix_nano: number | null;
  duration_ns: number | null;
  service_name: string | null;
  channel: string | null;
  state: string | null;
  outcome: string | null;
  attributes: string | null;
  resource_attributes: string | null;
};

type Pagination = {
  limit: number;
  offset: number;
  total: number;
};

const DEFAULT_OVERVIEW_LIMIT = 50;
const DEFAULT_TIMELINE_LIMIT = 200;

export function useSessionTimelineData() {
  const [query, setQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');

  const [overviewItems, setOverviewItems] = useState<SessionOverviewItem[]>([]);
  const [overviewPagination, setOverviewPagination] = useState<Pagination>({ limit: DEFAULT_OVERVIEW_LIMIT, offset: 0, total: 0 });
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);

  const [timelineItems, setTimelineItems] = useState<SessionTimelineItem[]>([]);
  const [timelinePagination, setTimelinePagination] = useState<Pagination>({ limit: DEFAULT_TIMELINE_LIMIT, offset: 0, total: 0 });
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    const params = new URLSearchParams({
      limit: String(overviewPagination.limit),
      offset: String(overviewPagination.offset)
    });
    if (query.trim()) params.set('q', query.trim());
    if (eventTypeFilter !== 'all') params.set('eventType', eventTypeFilter);

    const res = await fetch(`/api/sessions/overview?${params.toString()}`);
    if (!res.ok) throw new Error(`Load sessions overview failed: ${res.status}`);
    const data = await res.json();

    const items = (Array.isArray(data.items) ? data.items : []) as SessionOverviewItem[];
    setOverviewItems(items);

    const pagination = data?.pagination ?? {};
    setOverviewPagination((prev) => ({
      limit: Number(pagination.limit) || prev.limit,
      offset: Number(pagination.offset) || 0,
      total: Number(pagination.total) || 0
    }));

    setSelectedSessionKey((prev) => {
      if (prev && items.some((item) => item.session_key === prev)) return prev;
      return items[0]?.session_key ?? null;
    });
  }, [eventTypeFilter, overviewPagination.limit, overviewPagination.offset, query]);

  const loadTimeline = useCallback(async (sessionKey: string) => {
    setTimelineLoading(true);
    setTimelineError(null);

    const params = new URLSearchParams({
      limit: String(timelinePagination.limit),
      offset: String(timelinePagination.offset)
    });

    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/timeline?${params.toString()}`);
    if (!res.ok) throw new Error(`Load session timeline failed: ${res.status}`);
    const data = await res.json();

    const items = (Array.isArray(data.items) ? data.items : []) as SessionTimelineItem[];
    setTimelineItems(items);

    const pagination = data?.pagination ?? {};
    setTimelinePagination((prev) => ({
      limit: Number(pagination.limit) || prev.limit,
      offset: Number(pagination.offset) || 0,
      total: Number(pagination.total) || 0
    }));
  }, [timelinePagination.limit, timelinePagination.offset]);

  useEffect(() => {
    loadOverview()
      .catch((err: Error) => setOverviewError(err.message || 'Failed to load sessions overview'))
      .finally(() => setOverviewLoading(false));
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedSessionKey) {
      setTimelineItems([]);
      setTimelinePagination((prev) => ({ ...prev, total: 0, offset: 0 }));
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    loadTimeline(selectedSessionKey)
      .catch((err: Error) => setTimelineError(err.message || 'Failed to load session timeline'))
      .finally(() => setTimelineLoading(false));
  }, [loadTimeline, selectedSessionKey]);

  const eventTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of overviewItems) {
      for (const value of item.event_types || []) set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [overviewItems]);

  return {
    query,
    setQuery,
    eventTypeFilter,
    setEventTypeFilter,
    eventTypeOptions,
    overviewItems,
    overviewPagination,
    overviewLoading,
    overviewError,
    selectedSessionKey,
    setSelectedSessionKey,
    timelineItems,
    timelinePagination,
    timelineLoading,
    timelineError,
    refreshOverview: loadOverview,
    refreshTimeline: () => (selectedSessionKey ? loadTimeline(selectedSessionKey) : Promise.resolve())
  };
}
