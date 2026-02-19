import { useCallback, useEffect, useState } from 'react';

export type TraceSummary = {
  trace_id: string;
  span_count: number;
  duration_ns: number | null;
  root_span_name: string;
  start_ns: number | null;
  end_ns: number | null;
  first_received_at: string;
  last_received_at: string;
  input_tokens?: number;
  output_tokens?: number;
  service_names?: string[];
  primary_service_name?: string;
};

export type SpanRow = {
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

export function useTraceData(autoRefresh: boolean) {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [spans, setSpans] = useState<SpanRow[]>([]);
  const [selectedSpanId, setSelectedSpanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTraces = useCallback(async () => {
    const res = await fetch('/api/traces?limit=200&offset=0');
    if (!res.ok) throw new Error(`Load traces failed: ${res.status}`);
    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as TraceSummary[];
    setTraces(items);
    return items;
  }, []);

  const loadTraceDetail = useCallback(async (traceId: string) => {
    const res = await fetch(`/api/traces/${encodeURIComponent(traceId)}?limit=500&offset=0`);
    if (!res.ok) throw new Error(`Load trace detail failed: ${res.status}`);
    const data = await res.json();
    const items = (Array.isArray(data.items) ? data.items : []) as SpanRow[];
    setSpans(items);
    setSelectedSpanId((prev) => (prev != null && items.some((item) => item.id === prev) ? prev : (items[0]?.id ?? null)));
  }, []);

  const refreshAll = useCallback(
    async (traceIdToKeep: string | null) => {
      setError(null);
      const items = await loadTraces();

      const nextTraceId = traceIdToKeep && items.some((t) => t.trace_id === traceIdToKeep)
        ? traceIdToKeep
        : (items[0]?.trace_id ?? null);

      setSelectedTraceId(nextTraceId);

      if (nextTraceId) {
        await loadTraceDetail(nextTraceId);
      } else {
        setSpans([]);
        setSelectedSpanId(null);
      }
    },
    [loadTraceDetail, loadTraces]
  );

  useEffect(() => {
    refreshAll(null)
      .catch((err: Error) => setError(err.message || 'Failed to load traces'))
      .finally(() => setLoading(false));
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedTraceId) {
      setSpans([]);
      setSelectedSpanId(null);
      return;
    }

    loadTraceDetail(selectedTraceId).catch((err: Error) => setError(err.message || 'Failed to load trace detail'));
  }, [loadTraceDetail, selectedTraceId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      refreshAll(selectedTraceId).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshAll, selectedTraceId]);

  return {
    traces,
    selectedTraceId,
    setSelectedTraceId,
    spans,
    selectedSpanId,
    setSelectedSpanId,
    loading,
    error,
    setError,
    refreshAll,
  };
}
