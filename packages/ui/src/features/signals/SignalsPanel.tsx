import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import type { LogRecord, MetricRecord, SharedSignalFilters } from '@/hooks/useSignalRecordsData';
import { useSignalRecordsData } from '@/hooks/useSignalRecordsData';

type SignalsPanelProps = {
  initialFilters?: Partial<SharedSignalFilters>;
};

export function SignalsPanel({ initialFilters }: SignalsPanelProps) {
  const {
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
    resetFilters
  } = useSignalRecordsData(initialFilters);

  const activeFilterHints = useMemo(() => {
    const rows = [
      filters.from && `from=${filters.from}`,
      filters.to && `to=${filters.to}`,
      filters.service && `service=${filters.service}`,
      filters.sessionKey && `sessionKey=${filters.sessionKey}`,
      filters.parseStatus !== 'all' && `parseStatus=${filters.parseStatus}`,
      metricName && `metricName=${metricName}`,
      severity && `severity=${severity}`
    ].filter(Boolean) as string[];
    return rows;
  }, [filters, metricName, severity]);

  return (
    <section className="space-y-4" data-testid="signals-panel">
      <div className="rounded-md border border-border bg-card p-3">
        <h2 className="text-sm font-medium">Signals Filters</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Input aria-label="Filter from" placeholder="from (ISO8601)" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
          <Input aria-label="Filter to" placeholder="to (ISO8601)" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
          <Input aria-label="Filter service" placeholder="service" value={filters.service} onChange={(e) => setFilters((prev) => ({ ...prev, service: e.target.value }))} />
          <Input aria-label="Filter session key" placeholder="session key" value={filters.sessionKey} onChange={(e) => setFilters((prev) => ({ ...prev, sessionKey: e.target.value }))} />
          <select aria-label="Filter parse status" className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={filters.parseStatus} onChange={(e) => setFilters((prev) => ({ ...prev, parseStatus: e.target.value as SharedSignalFilters['parseStatus'] }))}>
            <option value="all">All parse status</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
          </select>
          <Input aria-label="Filter metric name" placeholder="metricName" value={metricName} onChange={(e) => setMetricName(e.target.value)} />
          <Input aria-label="Filter severity" placeholder="severity" value={severity} onChange={(e) => setSeverity(e.target.value)} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"
              onClick={() => applyFilters()}
            >
              Apply
            </button>
            <button
              type="button"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted"
              onClick={() => resetFilters()}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Focus:</span>
        <button
          type="button"
          className={`rounded border px-2 py-1 ${activeTab === 'metrics' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          onClick={() => setActiveTab('metrics')}
        >
          metrics
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 ${activeTab === 'logs' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
          onClick={() => setActiveTab('logs')}
        >
          logs
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecordSection
          title="Metrics records"
          type="metrics"
          activeFilterHints={activeFilterHints}
          items={metricsItems}
          loading={metricsLoading}
          error={metricsError}
          selectedId={selectedMetricRecordId}
          onSelect={setSelectedMetricRecordId}
          pagination={metricsPagination}
          setPagination={(updater) => {
            setActiveTab('metrics');
            setMetricsPagination(updater);
          }}
          detail={selectedMetricRecord}
        />

        <RecordSection
          title="Logs records"
          type="logs"
          activeFilterHints={activeFilterHints}
          items={logsItems}
          loading={logsLoading}
          error={logsError}
          selectedId={selectedLogRecordId}
          onSelect={setSelectedLogRecordId}
          pagination={logsPagination}
          setPagination={(updater) => {
            setActiveTab('logs');
            setLogsPagination(updater);
          }}
          detail={selectedLogRecord}
        />
      </div>
    </section>
  );
}

type RecordSectionProps = {
  title: string;
  type: 'metrics' | 'logs';
  activeFilterHints: string[];
  items: Array<MetricRecord | LogRecord>;
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  pagination: { limit: number; offset: number; total: number };
  setPagination: (updater: (prev: { limit: number; offset: number; total: number }) => { limit: number; offset: number; total: number }) => void;
  detail: MetricRecord | LogRecord | null;
};

function RecordSection({ title, type, activeFilterHints, items, loading, error, selectedId, onSelect, pagination, setPagination, detail }: RecordSectionProps) {
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const maxPage = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  const hasPrev = pagination.offset > 0;
  const hasNext = pagination.offset + pagination.limit < pagination.total;

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Page {currentPage}/{maxPage}</span>
          <select
            aria-label={`${type} page size`}
            className="h-8 rounded-md border border-border bg-background px-1"
            value={pagination.limit}
            onChange={(e) => setPagination((prev) => ({ ...prev, limit: Number(e.target.value), offset: 0 }))}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div className="mt-3 max-h-[360px] overflow-auto">
        {loading ? <p className="text-sm text-muted-foreground">Loading {type} records…</p> : null}
        {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>No {type} records found.</p>
            {activeFilterHints.length > 0 ? <p>Active filters: {activeFilterHints.join(', ')}</p> : <p>Tip: set service/session/time filters to narrow down results.</p>}
          </div>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <ul className="space-y-1" data-testid={`${type}-records-list`}>
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`w-full rounded border px-2 py-2 text-left text-xs ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
                    onClick={() => onSelect(item.id)}
                    aria-label={`Select ${type} record ${item.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">#{item.id}</span>
                      <span className="text-muted-foreground">{formatDate(item.received_at)}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {item.service_name || '-'} · {item.session_key || '-'} · {item.parse_status}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-50"
          disabled={!hasPrev}
          onClick={() => setPagination((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
        >
          Prev
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-50"
          disabled={!hasNext}
          onClick={() => setPagination((prev) => ({ ...prev, offset: prev.offset + prev.limit }))}
        >
          Next
        </button>
      </div>

      <RecordDetailPanel record={detail} type={type} />
    </section>
  );
}

function RecordDetailPanel({ record, type }: { record: MetricRecord | LogRecord | null; type: 'metrics' | 'logs' }) {
  const derived = useMemo(() => {
    if (!record) return [] as Array<{ key: string; value: string }>;
    const rows = [
      { key: 'service_name', value: record.service_name || '-' },
      { key: 'session_key', value: record.session_key || '-' }
    ];

    if (type === 'logs') {
      const logRecord = record as LogRecord;
      rows.push({ key: 'severity', value: [logRecord.severity_text, logRecord.severity_number].filter(Boolean).join(' / ') || '-' });
    } else {
      const metricRecord = record as MetricRecord;
      rows.push({ key: 'metric_names', value: metricRecord.metric_names || '-' });
    }

    return rows;
  }, [record, type]);

  if (!record) {
    return <div className="mt-3 rounded border border-border bg-muted/20 p-2 text-xs text-muted-foreground">Select a record to inspect details.</div>;
  }

  return (
    <div className="mt-3 space-y-2 rounded border border-border bg-muted/20 p-2 text-xs" data-testid={`${type}-record-detail`}>
      <h4 className="font-medium">Record Detail</h4>
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-1">
        <div className="text-muted-foreground">received_at</div>
        <div>{record.received_at}</div>
        <div className="text-muted-foreground">content_type</div>
        <div>{record.content_type || '-'}</div>
        <div className="text-muted-foreground">item_count</div>
        <div>{record.item_count ?? '-'}</div>
        <div className="text-muted-foreground">parse_status</div>
        <div>{record.parse_status || '-'}</div>
        <div className="text-muted-foreground">parse_error</div>
        <div>{record.parse_error || '-'}</div>
      </div>

      <div className="rounded border border-border bg-background/50 p-2">
        <div className="mb-1 text-muted-foreground">Derived fields</div>
        {derived.map((row) => (
          <div key={row.key} className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-1">
            <div className="text-muted-foreground">{row.key}</div>
            <div className="break-all">{row.value}</div>
          </div>
        ))}
      </div>

      <details className="rounded border border-border bg-background/50 p-2">
        <summary className="cursor-pointer text-muted-foreground">Raw payload preview</summary>
        <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all">{formatPayload(record.payload)}</pre>
      </details>
    </div>
  );
}

function formatPayload(value: string | null) {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
