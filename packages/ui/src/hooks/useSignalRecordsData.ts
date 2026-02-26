import { useCallback, useEffect, useMemo, useState } from 'react';

type ParseStatus = 'all' | 'ok' | 'error';

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

export function useSignalRecordsData(initial?: {
  service?: string;
  sessionKey?: string;
  from?: string;
  to?: string;
  parseStatus?: ParseStatus;
}) {
  const [filters, setFilters] = useState<SharedSignalFilters>({
    from: initial?.from ?? '',
    to: initial?.to ?? '',
    service: initial?.service ?? '',
    sessionKey: initial?.sessionKey ?? '',
    parseStatus: initial?.parseStatus ?? 'all'
  });

  const [metricName, setMetricName] = useState('');
  const [severity, setSeverity] = useState('');

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
  }, [initial]);

  const [metricsItems, setMetricsItems] = useState<MetricRecord[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsPagination, setMetricsPagination] = useState<Pagination>({ limit: DEFAULT_PAGE_SIZE, offset: 0, total: 0 });

  const [logsItems, setLogsItems] = useState<LogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsPagination, setLogsPagination] = useState<Pagination>({ limit: DEFAULT_PAGE_SIZE, offset: 0, total: 0 });

  const [selectedMetricRecordId, setSelectedMetricRecordId] = useState<number | null>(null);
  const [selectedLogRecordId, setSelectedLogRecordId] = useState<number | null>(null);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);

    const params = buildParams(metricsPagination, filters, { metricName });
    const res = await fetch(`/api/metrics/records?${params.toString()}`);
    if (!res.ok) throw new Error(`Load metrics records failed: ${res.status}`);

    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as MetricRecord[];
    setMetricsItems(items);
    setMetricsPagination((prev) => ({
      limit: Number(data?.pagination?.limit) || prev.limit,
      offset: Number(data?.pagination?.offset) || 0,
      total: Number(data?.pagination?.total) || 0
    }));

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
    setLogsPagination((prev) => ({
      limit: Number(data?.pagination?.limit) || prev.limit,
      offset: Number(data?.pagination?.offset) || 0,
      total: Number(data?.pagination?.total) || 0
    }));

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

  return {
    filters,
    setFilters,
    metricName,
    setMetricName,
    severity,
    setSeverity,

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
    refresh: () => Promise.all([loadMetrics(), loadLogs()])
  };
}
