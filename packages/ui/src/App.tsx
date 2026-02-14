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
    <main className="container">
      <header className="header">
        <div>
          <h1>agent-lens</h1>
          <p>Trace timeline explorer</p>
        </div>
        <div className="controls">
          <select value={range} onChange={(e) => setRange(e.target.value as any)}>
            <option value="all">All time</option>
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
          </select>
          <label className="inlineLabel">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh
          </label>
          <button className="refreshBtn" onClick={() => refreshAll()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="errorBox">{error}</div> : null}

      <section className="layout">
        <aside className="traceList card">
          <h2>Traces ({filteredTraces.length})</h2>
          {loading ? <p className="muted">Loading traces...</p> : null}
          <div className="list">
            {filteredTraces.map((trace) => (
              <button
                key={trace.trace_id}
                className={`traceItem ${trace.trace_id === selectedTraceId ? 'active' : ''}`}
                onClick={() => setSelectedTraceId(trace.trace_id)}
              >
                <div className="row">
                  <strong>{trace.root_span_name || '(unknown root)'}</strong>
                  <span className="pill">{trace.span_count} spans</span>
                </div>
                <div className="meta">duration: {formatDurationNs(trace.duration_ns)}</div>
                <div className="meta">time: {new Date(trace.last_received_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="traceDetail card">
          <h2>Trace Detail</h2>
          {!selectedTrace ? (
            <p className="muted">Select a trace from the left list.</p>
          ) : (
            <>
              <div className="meta">traceId: {selectedTrace.trace_id}</div>
              <div className="meta">root: {selectedTrace.root_span_name}</div>
              <div className="meta">total duration: {formatDurationNs(selectedTrace.duration_ns)}</div>
              <div className="meta">span count: {selectedTrace.span_count}</div>
              <h3>Spans</h3>
              {spans.length === 0 ? (
                <p className="muted">No spans found for this trace.</p>
              ) : (
                <div className="list">
                  {spans.map((span) => (
                    <article key={span.id} className="spanItem">
                      <div className="row">
                        <strong>{span.name || 'unknown'}</strong>
                        <span className="muted">{formatDurationNs(span.duration_ns)}</span>
                      </div>
                      <div className="meta">spanId: {span.span_id || '-'}</div>
                      <div className="meta">parentSpanId: {span.parent_span_id || '-'}</div>
                      <div className="meta">received: {new Date(span.received_at).toLocaleString()}</div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}
