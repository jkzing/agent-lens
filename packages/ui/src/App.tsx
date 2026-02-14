import { useEffect, useMemo, useState } from 'react';

type SpanRow = {
  id: number;
  received_at: string;
  trace_id: string | null;
  span_id: string | null;
  parent_span_id: string | null;
  name: string | null;
  kind: number | null;
  start_time_unix_nano: string | null;
  end_time_unix_nano: string | null;
  duration_ns: number | null;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:4318';

function formatDurationNs(durationNs: number | null): string {
  if (durationNs == null) return '-';
  if (durationNs < 1_000) return `${durationNs} ns`;
  if (durationNs < 1_000_000) return `${(durationNs / 1_000).toFixed(2)} μs`;
  if (durationNs < 1_000_000_000) return `${(durationNs / 1_000_000).toFixed(2)} ms`;
  return `${(durationNs / 1_000_000_000).toFixed(2)} s`;
}

export default function App() {
  const [items, setItems] = useState<SpanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpans = async () => {
    setError(null);
    const res = await fetch(`${API_BASE}/api/spans?limit=100`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    setItems(Array.isArray(data.items) ? data.items : []);
  };

  useEffect(() => {
    fetchSpans()
      .catch((err: Error) => setError(err.message || 'Failed to load spans'))
      .finally(() => setLoading(false));
  }, []);

  const total = useMemo(() => items.length, [items]);

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>agent-lens</h1>
          <p>OTEL span viewer (MVP)</p>
        </div>
        <button
          className="refreshBtn"
          onClick={() => {
            setLoading(true);
            fetchSpans()
              .catch((err: Error) => setError(err.message || 'Failed to refresh'))
              .finally(() => setLoading(false));
          }}
        >
          Refresh
        </button>
      </header>

      <section className="card">
        <h2>Status</h2>
        <ul>
          <li>Server: {API_BASE}</li>
          <li>Loaded spans: {total}</li>
          <li>State: {loading ? 'Loading...' : 'Ready'}</li>
          {error ? <li className="error">Error: {error}</li> : null}
        </ul>
      </section>

      <section className="card">
        <h2>Spans</h2>
        {items.length === 0 ? (
          <p className="muted">No spans yet. Send OTEL payload to POST /v1/traces.</p>
        ) : (
          <div className="list">
            {items.map((span) => (
              <article key={span.id} className="spanItem">
                <div className="row">
                  <strong>{span.name || 'unknown'}</strong>
                  <span className="muted">#{span.id}</span>
                </div>
                <div className="meta">traceId: {span.trace_id || '-'}</div>
                <div className="meta">spanId: {span.span_id || '-'}</div>
                <div className="meta">duration: {formatDurationNs(span.duration_ns)}</div>
                <div className="meta">received: {new Date(span.received_at).toLocaleString()}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
