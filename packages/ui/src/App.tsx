import { useEffect, useMemo, useState } from 'react';

type TraceSummary = {
  trace_id: string;
  span_count: number;
  duration_ns: number | null;
  root_span_name: string;
  start_ns: number | null;
  end_ns: number | null;
  first_received_at: string;
  last_received_at: string;
};

type SpanRow = {
  id: number;
  received_at: string;
  trace_id: string;
  span_id: string | null;
  parent_span_id: string | null;
  name: string | null;
  kind: number | null;
  start_time_unix_nano: string | null;
  end_time_unix_nano: string | null;
  duration_ns: number | null;
  attributes: string | null;
  status_code: number | null;
  resource_attributes: string | null;
  events: string | null;
  has_parent: boolean;
  depth: number;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4318';

function formatDurationNs(durationNs: number | null): string {
  if (durationNs == null) return '-';
  if (durationNs < 1_000) return `${durationNs} ns`;
  if (durationNs < 1_000_000) return `${(durationNs / 1_000).toFixed(2)} μs`;
  if (durationNs < 1_000_000_000) return `${(durationNs / 1_000_000).toFixed(2)} ms`;
  return `${(durationNs / 1_000_000_000).toFixed(2)} s`;
}

function withinRange(iso: string, range: string): boolean {
  if (range === 'all') return true;
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (range === '15m') return diff <= 15 * 60 * 1000;
  if (range === '1h') return diff <= 60 * 60 * 1000;
  if (range === '24h') return diff <= 24 * 60 * 60 * 1000;
  return true;
}

export default function App() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [spans, setSpans] = useState<SpanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'all' | '15m' | '1h' | '24h'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadTraces = async (keepSelection = true) => {
    const res = await fetch(`${API_BASE}/api/traces?limit=200&offset=0`);
    if (!res.ok) throw new Error(`Load traces failed: ${res.status}`);
    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as TraceSummary[];
    setTraces(items);

    if (!keepSelection || !selectedTraceId) {
      setSelectedTraceId(items[0]?.trace_id ?? null);
      return;
    }

    const stillExists = items.some((t) => t.trace_id === selectedTraceId);
    if (!stillExists) setSelectedTraceId(items[0]?.trace_id ?? null);
  };

  const loadTraceDetail = async (traceId: string) => {
    const res = await fetch(`${API_BASE}/api/traces/${encodeURIComponent(traceId)}?limit=500&offset=0`);
    if (!res.ok) throw new Error(`Load trace detail failed: ${res.status}`);
    const data = await res.json();
    setSpans(Array.isArray(data.items) ? data.items : []);
  };

  const refreshAll = async () => {
    setError(null);
    await loadTraces(true);
  };

  useEffect(() => {
    refreshAll()
      .catch((err: Error) => setError(err.message || 'Failed to load traces'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTraceId) {
      setSpans([]);
      return;
    }

    loadTraceDetail(selectedTraceId).catch((err: Error) => setError(err.message || 'Failed to load trace detail'));
  }, [selectedTraceId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      refreshAll().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, selectedTraceId]);

  const filteredTraces = useMemo(
    () => traces.filter((trace) => withinRange(trace.last_received_at, range)),
    [traces, range]
  );

  const selectedTrace = filteredTraces.find((t) => t.trace_id === selectedTraceId) || null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-7">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">agent-lens</h1>
            <p className="mt-1 text-sm text-slate-300">Trace timeline explorer</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value as any)}
            >
              <option value="all">All time</option>
              <option value="15m">Last 15m</option>
              <option value="1h">Last 1h</option>
              <option value="24h">Last 24h</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto refresh
            </label>
            <button
              className="h-9 rounded-md border border-indigo-500 bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500"
              onClick={() => refreshAll()}
            >
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 lg:max-h-[calc(100vh-160px)] lg:overflow-auto">
            <h2 className="mb-3 text-lg font-semibold">Traces ({filteredTraces.length})</h2>
            {loading ? <p className="text-sm text-slate-400">Loading traces...</p> : null}
            <div className="space-y-2">
              {filteredTraces.map((trace) => (
                <button
                  key={trace.trace_id}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    trace.trace_id === selectedTraceId
                      ? 'border-indigo-500 bg-indigo-900/30'
                      : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
                  }`}
                  onClick={() => setSelectedTraceId(trace.trace_id)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <strong className="line-clamp-1 text-sm">{trace.root_span_name || '(unknown root)'}</strong>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                      {trace.span_count} spans
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    duration: {formatDurationNs(trace.duration_ns)}
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    time: {new Date(trace.last_received_at).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-lg font-semibold">Trace Detail</h2>
            {!selectedTrace ? (
              <p className="text-sm text-slate-400">Select a trace from the left list.</p>
            ) : (
              <>
                <div className="font-mono text-xs text-slate-300">traceId: {selectedTrace.trace_id}</div>
                <div className="font-mono text-xs text-slate-300">root: {selectedTrace.root_span_name}</div>
                <div className="font-mono text-xs text-slate-300">
                  total duration: {formatDurationNs(selectedTrace.duration_ns)}
                </div>
                <div className="mb-3 font-mono text-xs text-slate-300">span count: {selectedTrace.span_count}</div>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Spans</h3>
                {spans.length === 0 ? (
                  <p className="text-sm text-slate-400">No spans found for this trace.</p>
                ) : (
                  <div className="space-y-2">
                    {spans.map((span) => (
                      <article key={span.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <strong className="text-sm">{span.name || 'unknown'}</strong>
                          <span className="text-xs text-slate-300">{formatDurationNs(span.duration_ns)}</span>
                        </div>
                        <div className="font-mono text-xs text-slate-300">spanId: {span.span_id || '-'}</div>
                        <div className="font-mono text-xs text-slate-300">
                          parentSpanId: {span.parent_span_id || '-'}
                        </div>
                        <div className="font-mono text-xs text-slate-400">
                          received: {new Date(span.received_at).toLocaleString()}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
