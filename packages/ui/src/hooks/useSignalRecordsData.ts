import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ParseStatus = 'all' | 'ok' | 'error';
type SignalsSubTab = 'metrics' | 'logs';

export type SharedSignalFilters = {
  from: string;
  to: string;
  service: string;
  sessionKey: string;
  parseStatus: ParseStatus;
};

export type MetricRecord = {
  id: number;
  received_at: string;
  content_type: string;
  parse_status: string;
  parse_error: string | null;
  item_count: number | null;
  service_name: string | null;
  session_key: string | null;
  metric_names: string | null;
  payload: string | null;
};

export type LogRecord = {
  id: number;
  received_at: string;
  content_type: string;
  parse_status: string;
  parse_error: string | null;
  item_count: number | null;
  service_name: string | null;
  session_key: string | null;
  severity_text: string | null;
  severity_number: number | null;
  payload: string | null;
};

type Pagination = {
  limit: number;
  offset: number;
  total: number;
};

const DEFAULT_PAGE_SIZE = 20;
const ALLOWED_LIMITS = new Set([10, 20, 50]);

function safeUrlParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function parseParseStatus(value: string | null): ParseStatus {
  if (value === 'ok' || value === 'error') return value;
  return 'all';
}

function parseSubTab(value: string | null): SignalsSubTab {
  return value === 'logs' ? 'logs' : 'metrics';
}

function parsePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return ALLOWED_LIMITS.has(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function buildParams(
  pagination: Pagination,
  filters: SharedSignalFilters,
  extra: Record<string, string>
) {
  const params = new URLSearchParams({
    limit: String(pagination.limit),
    offset: String(pagination.offset)
  });

  if (filters.from.trim()) params.set('from', filters.from.trim());
  if (filters.to.trim()) params.set('to', filters.to.trim());
  if (filters.service.trim()) params.set('service', filters.service.trim());
  if (filters.sessionKey.trim()) params.set('sessionKey', filters.sessionKey.trim());
  if (filters.parseStatus !== 'all') params.set('parseStatus', filters.parseStatus);

  for (const [key, value] of Object.entries(extra)) {
    if (value.trim()) params.set(key, value.trim());
  }

  return params;
}

function getInitialState(initial?: {
  service?: string;
  sessionKey?: string;
  from?: string;
  to?: string;
  parseStatus?: ParseStatus;
}) {
  const params = safeUrlParams();
  const tab = parseSubTab(params.get('tab'));
  const page = parsePage(params.get('page'));
  const limit = parseLimit(params.get('limit'));
  const pageOffset = (page - 1) * limit;

  return {
    filters: {
      from: initial?.from ?? params.get('from') ?? '',
      to: initial?.to ?? params.get('to') ?? '',
      service: initial?.service ?? params.get('service') ?? '',
      sessionKey: initial?.sessionKey ?? params.get('sessionKey') ?? '',
      parseStatus: initial?.parseStatus ?? parseParseStatus(params.get('parseStatus'))
    } as SharedSignalFilters,
    metricName: params.get('metricName') ?? '',
    severity: params.get('severity') ?? '',
    activeTab: tab,
    metricsPagination: {
      limit: tab === 'metrics' ? limit : DEFAULT_PAGE_SIZE,
      offset: tab === 'metrics' ? pageOffset : 0,
      total: 0
    } as Pagination,
    logsPagination: {
      limit: tab === 'logs' ? limit : DEFAULT_PAGE_SIZE,
      offset: tab === 'logs' ? pageOffset : 0,
      total: 0
    } as Pagination
  };
}

export function useSignalRecordsData(initial?: {
  service?: string;
  sessionKey?: string;
  from?: string;
  to?: string;
  parseStatus?: ParseStatus;
}) {
  const initialStateRef = useRef(getInitialState(initial));

  const [filters, setFilters] = useState<SharedSignalFilters>(initialStateRef.current.filters);
  const [metricName, setMetricName] = useState(initialStateRef.current.metricName);
  const [severity, setSeverity] = useState(initialStateRef.current.severity);
  const [activeTab, setActiveTab] = useState<SignalsSubTab>(initialStateRef.current.activeTab);

  const [metricsItems, setMetricsItems] = useState<MetricRecord[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsPagination, setMetricsPagination] = useState<Pagination>(initialStateRef.current.metricsPagination);

  const [logsItems, setLogsItems] = useState<LogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsPagination, setLogsPagination] = useState<Pagination>(initialStateRef.current.logsPagination);

  const [selectedMetricRecordId, setSelectedMetricRecordId] = useState<number | null>(null);
  const [selectedLogRecordId, setSelectedLogRecordId] = useState<number | null>(null);

  useEffect(() => {
    if (!initial) return;
    setFilters((prev) => ({
      ...prev,
      service: initial.service ?? prev.service,
      sessionKey: initial.sessionKey ?? prev.sessionKey,
      from: initial.from ?? prev.from,
      to: initial.to ?? prev.to,
      parseStatus: initial.parseStatus ?? prev.parseStatus
    }));
    setMetricsPagination((prev) => ({ ...prev, offset: 0 }));
    setLogsPagination((prev) => ({ ...prev, offset: 0 }));
  }, [initial]);

  const filterFingerprint = [
    filters.from,
    filters.to,
    filters.service,
    filters.sessionKey,
    filters.parseStatus,
    metricName,
    severity
  ].join('||');

  const lastFilterFingerprintRef = useRef(filterFingerprint);
  useEffect(() => {
    if (lastFilterFingerprintRef.current === filterFingerprint) return;
    lastFilterFingerprintRef.current = filterFingerprint;
    setMetricsPagination((prev) => ({ ...prev, offset: 0 }));
    setLogsPagination((prev) => ({ ...prev, offset: 0 }));
  }, [filterFingerprint]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);

    const params = buildParams(metricsPagination, filters, { metricName });
    const res = await fetch(`/api/metrics/records?${params.toString()}`);
    if (!res.ok) throw new Error(`Load metrics records failed: ${res.status}`);

    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as MetricRecord[];
    setMetricsItems(items);
    setMetricsPagination((prev) => {
      const next = {
        limit: Number(data?.pagination?.limit) || prev.limit,
        offset: Number(data?.pagination?.offset) || 0,
        total: Number(data?.pagination?.total) || 0
      };
      return next.limit === prev.limit && next.offset === prev.offset && next.total === prev.total ? prev : next;
    });

    setSelectedMetricRecordId((prev) => {
      if (prev && items.some((item) => item.id === prev)) return prev;
      return items[0]?.id ?? null;
    });
  }, [filters, metricName, metricsPagination]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);

    const params = buildParams(logsPagination, filters, { severity });
    const res = await fetch(`/api/logs/records?${params.toString()}`);
    if (!res.ok) throw new Error(`Load logs records failed: ${res.status}`);

    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as LogRecord[];
    setLogsItems(items);
    setLogsPagination((prev) => {
      const next = {
        limit: Number(data?.pagination?.limit) || prev.limit,
        offset: Number(data?.pagination?.offset) || 0,
        total: Number(data?.pagination?.total) || 0
      };
      return next.limit === prev.limit && next.offset === prev.offset && next.total === prev.total ? prev : next;
    });

    setSelectedLogRecordId((prev) => {
      if (prev && items.some((item) => item.id === prev)) return prev;
      return items[0]?.id ?? null;
    });
  }, [filters, logsPagination, severity]);

  useEffect(() => {
    loadMetrics().catch((err: Error) => setMetricsError(err.message || 'Failed to load metric records')).finally(() => setMetricsLoading(false));
  }, [loadMetrics]);

  useEffect(() => {
    loadLogs().catch((err: Error) => setLogsError(err.message || 'Failed to load log records')).finally(() => setLogsLoading(false));
  }, [loadLogs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    const syncParam = (key: string, value: string) => {
      if (value.trim()) params.set(key, value.trim());
      else params.delete(key);
    };

    syncParam('from', filters.from);
    syncParam('to', filters.to);
    syncParam('service', filters.service);
    syncParam('sessionKey', filters.sessionKey);
    if (filters.parseStatus !== 'all') params.set('parseStatus', filters.parseStatus);
    else params.delete('parseStatus');
    syncParam('metricName', metricName);
    syncParam('severity', severity);

    params.set('tab', activeTab);
    const activePagination = activeTab === 'metrics' ? metricsPagination : logsPagination;
    params.set('page', String(Math.floor(activePagination.offset / activePagination.limit) + 1));
    params.set('limit', String(activePagination.limit));

    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [activeTab, filters, logsPagination, metricName, metricsPagination, severity]);

  const selectedMetricRecord = useMemo(
    () => metricsItems.find((item) => item.id === selectedMetricRecordId) ?? null,
    [metricsItems, selectedMetricRecordId]
  );

  const selectedLogRecord = useMemo(
    () => logsItems.find((item) => item.id === selectedLogRecordId) ?? null,
    [logsItems, selectedLogRecordId]
  );

  const applyFilters = useCallback(() => {
    setMetricsPagination((prev) => ({ ...prev, offset: 0 }));
    setLogsPagination((prev) => ({ ...prev, offset: 0 }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ from: '', to: '', service: '', sessionKey: '', parseStatus: 'all' });
    setMetricName('');
    setSeverity('');
    setActiveTab('metrics');
    setMetricsPagination((prev) => ({ ...prev, offset: 0, limit: DEFAULT_PAGE_SIZE }));
    setLogsPagination((prev) => ({ ...prev, offset: 0, limit: DEFAULT_PAGE_SIZE }));
  }, []);

  return {
    filters,
    setFilters,
    metricName,
    setMetricName,
    severity,
    setSeverity,
    activeTab,
    setActiveTab,

    metricsItems,
    metricsLoading,
    metricsError,
    metricsPagination,
    setMetricsPagination,
    selectedMetricRecord,
    selectedMetricRecordId,
    setSelectedMetricRecordId,

    logsItems,
    logsLoading,
    logsError,
    logsPagination,
    setLogsPagination,
    selectedLogRecord,
    selectedLogRecordId,
    setSelectedLogRecordId,

    applyFilters,
    resetFilters,
    refresh: () => Promise.all([loadMetrics(), loadLogs()])
  };
}
