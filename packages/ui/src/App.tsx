import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TraceSummary = {
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

type SpanKindType = 'llm' | 'tool' | 'internal';

type SpanEvent = {
  name: string;
  timeUnixNano: number | null;
  attributes: Record<string, unknown>;
};

type PricingRule = {
  key: string;
  matchers: string[];
  inputPerToken: number;
  outputPerToken: number;
};

type ModelCostStat = {
  key: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

const PRICING_RULES: PricingRule[] = [
  { key: 'openai:gpt-4o', matchers: ['openai/gpt-4o', 'gpt-4o'], inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  { key: 'openai:gpt-4.1', matchers: ['openai/gpt-4.1', 'gpt-4.1'], inputPerToken: 0.000002, outputPerToken: 0.000008 },
  { key: 'openai:gpt-5', matchers: ['openai-codex/gpt-5', 'openai/gpt-5', 'gpt-5'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-3-7', matchers: ['anthropic/claude-3-7', 'claude-3-7'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-sonnet-4', matchers: ['anthropic/claude-sonnet-4', 'claude-sonnet-4', 'sonnet'], inputPerToken: 0.000003, outputPerToken: 0.000015 },
  { key: 'anthropic:claude-opus-4', matchers: ['anthropic/claude-opus-4', 'claude-opus-4', 'opus'], inputPerToken: 0.000015, outputPerToken: 0.000075 },
  { key: 'google:gemini-2.5', matchers: ['google/gemini-2.5', 'gemini-2.5'], inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  { key: 'deepseek:deepseek-v3', matchers: ['deepseek/deepseek-v3', 'deepseek-v3'], inputPerToken: 0.000001, outputPerToken: 0.000002 },
  { key: 'default', matchers: [], inputPerToken: 0.000003, outputPerToken: 0.000015 }
];

function formatDurationNs(durationNs: number | null): string {
  if (durationNs == null) return '-';
  if (durationNs < 1_000) return `${durationNs} ns`;
  if (durationNs < 1_000_000) return `${(durationNs / 1_000).toFixed(2)} μs`;
  if (durationNs < 1_000_000_000) return `${(durationNs / 1_000_000).toFixed(2)} ms`;
  return `${(durationNs / 1_000_000_000).toFixed(2)} s`;
}

function formatOffsetMs(offsetNs: number): string {
  return `${(offsetNs / 1_000_000).toFixed(2)} ms`;
}

function withinRange(iso: string, range: string): boolean {
  if (range === 'all') return true;
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (range === '15m') return diff <= 15 * 60 * 1000;
  if (range === '1h') return diff <= 60 * 60 * 1000;
  if (range === '24h') return diff <= 24 * 60 * 1000;
  return true;
}

function parseJsonObject(input: string | null): Record<string, any> {
  if (!input) return {};
  try {
    const obj = JSON.parse(input);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function parseSpanEvents(input: string | null): SpanEvent[] {
  if (!input) return [];

  const toEvent = (item: unknown): SpanEvent | null => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : 'unknown';
    const rawTime = record.time_unix_nano ?? record.timeUnixNano ?? null;
    const parsedTime = rawTime == null ? null : Number(rawTime);
    const attrsRaw = record.attributes;
    const attributes = attrsRaw && typeof attrsRaw === 'object' ? (attrsRaw as Record<string, unknown>) : {};
    return {
      name,
      timeUnixNano: Number.isFinite(parsedTime) ? parsedTime : null,
      attributes
    };
  };

  try {
    const parsed = JSON.parse(input) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(toEvent).filter((v): v is SpanEvent => v !== null);
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.events)) {
        return obj.events.map(toEvent).filter((v): v is SpanEvent => v !== null);
      }
    }
  } catch {
    return [];
  }

  return [];
}

function detectSpanType(span: SpanRow, attrs: Record<string, any>): SpanKindType {
  const name = (span.name || '').toLowerCase();
  const keys = Object.keys(attrs).join(' ').toLowerCase();

  if (name.includes('llm') || keys.includes('gen_ai') || keys.includes('openai') || keys.includes('anthropic')) {
    return 'llm';
  }
  if (name.includes('tool') || keys.includes('tool') || keys.includes('function_call')) {
    return 'tool';
  }
  return 'internal';
}

function spanTypeColor(type: SpanKindType): string {
  if (type === 'llm') return 'bg-span-llm/80';
  if (type === 'tool') return 'bg-span-tool/80';
  return 'bg-span-internal/80';
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function detectLoopPattern(spans: SpanRow[]): Set<number> {
  const toolSpans = spans.filter((span) => {
    const attrs = parseJsonObject(span.attributes);
    return detectSpanType(span, attrs) === 'tool';
  });

  const nameCount = new Map<string, number>();
  for (const span of toolSpans) {
    const key = (span.name || 'unknown').toLowerCase();
    nameCount.set(key, (nameCount.get(key) || 0) + 1);
  }

  const suspiciousNames = new Set(
    Array.from(nameCount.entries())
      .filter(([, count]) => count >= 3)
      .map(([name]) => name)
  );

  const suspiciousIds = new Set<number>();
  for (const span of toolSpans) {
    if (suspiciousNames.has((span.name || 'unknown').toLowerCase())) {
      suspiciousIds.add(span.id);
    }
  }
  return suspiciousIds;
}

function getTimelineTicks(totalNs: number): number[] {
  const totalMs = Math.max(1, totalNs / 1_000_000);
  const targetTicks = 6;
  const roughStep = totalMs / targetTicks;
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
  const stepMs = candidates.find((v) => v >= roughStep) ?? candidates[candidates.length - 1];

  const ticks: number[] = [];
  for (let ms = 0; ms <= totalMs + 1e-6; ms += stepMs) {
    ticks.push(ms * 1_000_000);
  }
  if (ticks[ticks.length - 1] < totalNs) ticks.push(totalNs);
  return ticks;
}

function formatTick(ns: number): string {
  const ms = ns / 1_000_000;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(ms % 1_000 === 0 ? 0 : 1)}s`;
  if (ms >= 1) return `${Math.round(ms)}ms`;
  return `${ms.toFixed(2)}ms`;
}

function eventVariant(name: string): 'default' | 'outline' {
  if (name === 'gen_ai.content.prompt' || name === 'gen_ai.content.completion') return 'default';
  return 'outline';
}

function normalizeValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function getSpanModelInfo(span: SpanRow): { provider: string; model: string } {
  const attrs = parseJsonObject(span.attributes);
  const resource = parseJsonObject(span.resource_attributes);
  const model =
    attrs['gen_ai.request.model'] ??
    attrs['llm.model'] ??
    attrs['model'] ??
    attrs['ai.model'] ??
    resource['gen_ai.request.model'] ??
    resource['llm.model'] ??
    resource['model'] ??
    'unknown';
  const provider =
    attrs['gen_ai.system'] ??
    attrs['gen_ai.provider'] ??
    attrs['provider'] ??
    resource['service.namespace'] ??
    resource['provider'] ??
    'unknown';

  return {
    model: typeof model === 'string' && model.trim() ? model.trim() : 'unknown',
    provider: typeof provider === 'string' && provider.trim() ? provider.trim() : 'unknown'
  };
}

function findPricingRule(provider: string, model: string): PricingRule {
  const full = normalizeValue(`${provider}/${model}`);
  const modelOnly = normalizeValue(model);
  for (const rule of PRICING_RULES) {
    if (rule.key === 'default') continue;
    if (rule.matchers.some((m) => full.includes(m) || modelOnly.includes(m))) {
      return rule;
    }
  }
  return PRICING_RULES.find((r) => r.key === 'default')!;
}

function estimateCost(inputTokens: number, outputTokens: number, provider: string, model: string): number {
  const rule = findPricingRule(provider, model);
  return inputTokens * rule.inputPerToken + outputTokens * rule.outputPerToken;
}

function buildSpanContextRows(span: SpanRow): Array<{ label: string; value: string }> {
  const attrs = parseJsonObject(span.attributes);
  const resource = parseJsonObject(span.resource_attributes);
  const candidates: Array<[string, string[]]> = [
    ['sessionKey', ['session.key', 'sessionKey', 'openclaw.session_key', 'agent.session_key']],
    ['sessionId', ['session.id', 'sessionId', 'openclaw.session_id', 'agent.session_id']],
    ['channel', ['channel', 'messaging.channel', 'openclaw.channel', 'agent.channel']],
    ['provider', ['gen_ai.provider', 'gen_ai.system', 'provider']],
    ['model', ['gen_ai.request.model', 'llm.model', 'model']]
  ];

  const rows: Array<{ label: string; value: string }> = [];
  for (const [label, keys] of candidates) {
    let value: unknown;
    for (const key of keys) {
      value = attrs[key];
      if (value != null && String(value).trim()) break;
      value = resource[key];
      if (value != null && String(value).trim()) break;
    }
    if (value != null && String(value).trim()) {
      rows.push({ label, value: String(value) });
    }
  }
  return rows;
}

async function exportTrace(traceId: string, format: 'json' | 'csv') {
  const res = await fetch(`/api/traces/${encodeURIComponent(traceId)}/export?format=${format}`);
  if (!res.ok) {
    throw new Error(`Export ${format.toUpperCase()} failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trace-${traceId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [spans, setSpans] = useState<SpanRow[]>([]);
  const [selectedSpanId, setSelectedSpanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'all' | '15m' | '1h' | '24h'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [traceSearch, setTraceSearch] = useState('');

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
  }, [selectedTraceId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      refreshAll(selectedTraceId).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshAll, selectedTraceId]);

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const trace of traces) {
      (trace.service_names || []).forEach((name) => set.add(name));
      if (trace.primary_service_name) set.add(trace.primary_service_name);
    }
    return Array.from(set).sort();
  }, [traces]);

  const filteredTraces = useMemo(
    () =>
      traces.filter((trace) => {
        if (!withinRange(trace.last_received_at, range)) return false;
        if (agentFilter !== 'all' && !(trace.service_names || []).includes(agentFilter) && trace.primary_service_name !== agentFilter) {
          return false;
        }
        if (!traceSearch.trim()) return true;
        return (trace.root_span_name || '').toLowerCase().includes(traceSearch.trim().toLowerCase());
      }),
    [traces, range, agentFilter, traceSearch]
  );

  const tracesByAgent = useMemo(() => {
    const groups: Record<string, TraceSummary[]> = {};
    for (const trace of filteredTraces) {
      const key = trace.primary_service_name || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(trace);
    }
    return groups;
  }, [filteredTraces]);

  useEffect(() => {
    if (filteredTraces.length === 0) {
      if (selectedTraceId !== null) {
        setSelectedTraceId(null);
        setSpans([]);
        setSelectedSpanId(null);
      }
      return;
    }

    if (!selectedTraceId || !filteredTraces.some((t) => t.trace_id === selectedTraceId)) {
      setSelectedTraceId(filteredTraces[0].trace_id);
    }
  }, [filteredTraces, selectedTraceId]);

  const selectedTrace = filteredTraces.find((t) => t.trace_id === selectedTraceId) || null;
  const selectedSpan = spans.find((s) => s.id === selectedSpanId) || null;
  const suspiciousLoopSpanIds = useMemo(() => detectLoopPattern(spans), [spans]);

  const traceCostStats = useMemo(() => {
    const byModel = new Map<string, ModelCostStat>();

    for (const span of spans) {
      const attrs = parseJsonObject(span.attributes);
      const inputTokens = toNumber(attrs['gen_ai.usage.input_tokens']);
      const outputTokens = toNumber(attrs['gen_ai.usage.output_tokens']);
      if (inputTokens <= 0 && outputTokens <= 0) continue;

      const info = getSpanModelInfo(span);
      const key = `${info.provider}::${info.model}`;
      const cost = estimateCost(inputTokens, outputTokens, info.provider, info.model);
      const existing = byModel.get(key);
      if (existing) {
        existing.inputTokens += inputTokens;
        existing.outputTokens += outputTokens;
        existing.cost += cost;
      } else {
        byModel.set(key, {
          key,
          model: info.model,
          provider: info.provider,
          inputTokens,
          outputTokens,
          cost
        });
      }
    }

    const modelRows = Array.from(byModel.values()).sort((a, b) => b.cost - a.cost);
    const input = modelRows.reduce((sum, row) => sum + row.inputTokens, 0);
    const output = modelRows.reduce((sum, row) => sum + row.outputTokens, 0);
    const cost = modelRows.reduce((sum, row) => sum + row.cost, 0);

    return { input, output, cost, modelRows };
  }, [spans]);

  const timelineMeta = useMemo(() => {
    const starts = spans
      .map((s) => (s.start_time_unix_nano ? Number(s.start_time_unix_nano) : null))
      .filter((v): v is number => Number.isFinite(v));
    const ends = spans
      .map((s) => (s.end_time_unix_nano ? Number(s.end_time_unix_nano) : null))
      .filter((v): v is number => Number.isFinite(v));

    const minStart = starts.length ? Math.min(...starts) : 0;
    const maxEnd = ends.length ? Math.max(...ends) : minStart + 1;
    const total = Math.max(1, maxEnd - minStart);

    return { minStart, total };
  }, [spans]);

  const ticks = useMemo(() => getTimelineTicks(timelineMeta.total), [timelineMeta.total]);
  const selectedSpanEvents = useMemo(() => parseSpanEvents(selectedSpan?.events ?? null), [selectedSpan]);
  const selectedSpanContextRows = useMemo(() => (selectedSpan ? buildSpanContextRows(selectedSpan) : []), [selectedSpan]);

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-5 py-7">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">agent-lens</h1>
              <p className="mt-1 text-sm text-muted-foreground">Trace timeline explorer</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={range}
                onChange={(e) => setRange(e.target.value as 'all' | '15m' | '1h' | '24h')}
              >
                <option value="all">All time</option>
                <option value="15m">Last 15m</option>
                <option value="1h">Last 1h</option>
                <option value="24h">Last 24h</option>
              </select>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
              >
                <option value="all">All agents</option>
                {agentOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                Auto refresh
              </label>
              <Button onClick={() => refreshAll(selectedTraceId).catch((err) => setError(err.message || 'Refresh failed'))}>Refresh</Button>
            </div>
          </header>

          {error ? <div className="mb-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-lg font-semibold">Traces ({filteredTraces.length})</h2>
              <Input value={traceSearch} onChange={(e) => setTraceSearch(e.target.value)} placeholder="Search root span name..." className="mb-3" />
              {loading ? <p className="text-sm text-muted-foreground">Loading traces...</p> : null}

              <ScrollArea className="h-[calc(100vh-250px)] pr-2">
                <div className="space-y-3">
                  {Object.entries(tracesByAgent).map(([agent, agentTraces]) => (
                    <div key={agent}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{agent}</div>
                      <div className="space-y-2">
                        {agentTraces.map((trace) => {
                          const inputTokens = toNumber(trace.input_tokens);
                          const outputTokens = toNumber(trace.output_tokens);

                          return (
                            <button
                              key={trace.trace_id}
                              className={cn(
                                'w-full rounded-lg border p-3 text-left transition',
                                trace.trace_id === selectedTraceId
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-background/40 hover:border-ring/60'
                              )}
                              onClick={() => setSelectedTraceId(trace.trace_id)}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <strong className="line-clamp-1 text-sm">{trace.root_span_name || '(unknown root)'}</strong>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">{trace.span_count} spans</span>
                              </div>
                              <div className="font-mono text-xs text-muted-foreground">duration: {formatDurationNs(trace.duration_ns)}</div>
                              <div className="font-mono text-xs text-muted-foreground">tokens: in {inputTokens} / out {outputTokens}</div>
                              <div className="font-mono text-xs text-muted-foreground">time: {new Date(trace.last_received_at).toLocaleString()}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </aside>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Trace Timeline</h2>
                  {selectedTrace ? (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => exportTrace(selectedTrace.trace_id, 'json').catch((err) => setError(err.message || 'Export failed'))}>
                        Export JSON
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => exportTrace(selectedTrace.trace_id, 'csv').catch((err) => setError(err.message || 'Export failed'))}>
                        Export CSV
                      </Button>
                    </div>
                  ) : null}
                </div>
                {!selectedTrace ? (
                  <p className="text-sm text-muted-foreground">Select a trace from the left list.</p>
                ) : (
                  <>
                    <div className="mb-3 grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground">
                      <div>traceId: {selectedTrace.trace_id}</div>
                      <div>root: {selectedTrace.root_span_name}</div>
                      <div>duration: {formatDurationNs(selectedTrace.duration_ns)}</div>
                      <div>span count: {selectedTrace.span_count}</div>
                      <div>input tokens: {traceCostStats.input}</div>
                      <div>output tokens: {traceCostStats.output}</div>
                      <div className="col-span-2 text-emerald-600 dark:text-emerald-400">estimated cost: ${traceCostStats.cost.toFixed(6)}</div>
                    </div>

                    {traceCostStats.modelRows.length > 0 ? (
                      <Card className="mb-3">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Per-model cost breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Model</TableHead>
                                <TableHead>Input</TableHead>
                                <TableHead>Output</TableHead>
                                <TableHead className="text-right">Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {traceCostStats.modelRows.map((row) => (
                                <TableRow key={row.key}>
                                  <TableCell className="font-mono text-xs">{row.provider}/{row.model}</TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">{row.inputTokens}</TableCell>
                                  <TableCell className="font-mono text-xs text-muted-foreground">{row.outputTokens}</TableCell>
                                  <TableCell className="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">${row.cost.toFixed(6)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ) : null}

                    {suspiciousLoopSpanIds.size > 0 ? (
                      <div className="mb-3 rounded border border-amber-600 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                        ⚠ possible tool loop detected ({suspiciousLoopSpanIds.size} spans in repeated tool patterns)
                      </div>
                    ) : null}

                    <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-span-llm" />LLM call</span>
                      <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-span-tool" />Tool call</span>
                      <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-span-internal" />Internal</span>
                    </div>

                    <div className="mb-2 relative h-8 rounded border border-border bg-background/50">
                      {ticks.map((tickNs, idx) => {
                        const leftPct = (tickNs / timelineMeta.total) * 100;
                        return (
                          <div key={`${tickNs}-${idx}`} className="absolute inset-y-0" style={{ left: `${leftPct}%` }}>
                            <div className="h-full w-px bg-border" />
                            <div className="-translate-x-1/2 pt-0.5 text-[10px] text-muted-foreground">{formatTick(tickNs)}</div>
                          </div>
                        );
                      })}
                    </div>

                    <ScrollArea className="h-[calc(100vh-470px)] rounded border border-border bg-background/30 p-2">
                      <div className="min-w-[760px] space-y-2">
                        {spans.map((span) => {
                          const attrs = parseJsonObject(span.attributes);
                          const type = detectSpanType(span, attrs);
                          const start = span.start_time_unix_nano ? Number(span.start_time_unix_nano) : timelineMeta.minStart;
                          const end = span.end_time_unix_nano ? Number(span.end_time_unix_nano) : start;
                          const left = ((start - timelineMeta.minStart) / timelineMeta.total) * 100;
                          const width = Math.max(0.8, ((Math.max(end, start + 1) - start) / timelineMeta.total) * 100);
                          const guideLevels = Array.from({ length: Math.max(0, span.depth) }, (_, i) => i);

                          return (
                            <button
                              key={span.id}
                              onClick={() => setSelectedSpanId(span.id)}
                              className={cn(
                                'w-full rounded-md border p-2 text-left transition',
                                selectedSpanId === span.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border bg-background/30 hover:border-ring/60',
                                span.status_code === 2 && 'ring-1 ring-red-500/70'
                              )}
                            >
                              <div className="grid grid-cols-[280px_minmax(0,1fr)] items-center gap-3">
                                <div className="relative h-7">
                                  {guideLevels.map((level) => (
                                    <span key={level} className="absolute top-0 h-full w-px bg-border/90" style={{ left: `${12 + level * 14}px` }} />
                                  ))}
                                  {span.depth > 0 ? (
                                    <span className="absolute top-1/2 h-px bg-border/90" style={{ left: `${12 + (span.depth - 1) * 14}px`, width: '14px' }} />
                                  ) : null}
                                  <div className="absolute top-1/2 right-0 -translate-y-1/2 truncate text-sm" style={{ left: `${18 + span.depth * 14}px` }}>
                                    {span.name || 'unknown'}
                                    {suspiciousLoopSpanIds.has(span.id) ? (
                                      <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">loop?</span>
                                    ) : null}
                                  </div>
                                </div>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="relative h-7 rounded bg-muted/60">
                                      <div className="absolute inset-y-0 border-r border-border/50" style={{ left: `${left}%` }} />
                                      <div className={`absolute top-1 h-5 rounded ${spanTypeColor(type)}`} style={{ left: `${left}%`, width: `${width}%` }} />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      <div className="font-semibold">{span.name || 'unknown'}</div>
                                      <div>duration: {formatDurationNs(span.duration_ns)}</div>
                                      <div>type: {type}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </div>

              <aside className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 text-lg font-semibold">Span Detail</h2>
                {!selectedSpan ? (
                  <p className="text-sm text-muted-foreground">Click a span in timeline to inspect details.</p>
                ) : (
                  (() => {
                    const attrs = parseJsonObject(selectedSpan.attributes);
                    const resourceAttrs = parseJsonObject(selectedSpan.resource_attributes);
                    const type = detectSpanType(selectedSpan, attrs);
                    const inputTokens = attrs['gen_ai.usage.input_tokens'];
                    const outputTokens = attrs['gen_ai.usage.output_tokens'];
                    const toolInput = attrs['tool.input'] ?? attrs['tool.arguments'] ?? attrs.input;
                    const toolOutput = attrs['tool.output'] ?? attrs.output;
                    const spanStart = selectedSpan.start_time_unix_nano ? Number(selectedSpan.start_time_unix_nano) : null;

                    return (
                      <div className="space-y-3 text-sm">
                        {selectedSpan.status_code === 2 ? (
                          <div className="rounded border border-destructive/40 bg-destructive/15 px-2 py-1 text-xs text-destructive">ERROR status span</div>
                        ) : null}

                        <div className="grid grid-cols-1 gap-1 font-mono text-xs text-muted-foreground">
                          <div>name: {selectedSpan.name || 'unknown'}</div>
                          <div>type: {type}</div>
                          <div>traceId: {selectedSpan.trace_id}</div>
                          <div>spanId: {selectedSpan.span_id || '-'}</div>
                          <div>duration: {formatDurationNs(selectedSpan.duration_ns)}</div>
                        </div>

                        {selectedSpanContextRows.length > 0 ? (
                          <div className="rounded border border-sky-700/40 bg-sky-500/10 p-2 text-xs">
                            <div className="mb-1 font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">Context</div>
                            <div className="space-y-1 font-mono">
                              {selectedSpanContextRows.map((row) => (
                                <div key={row.label} className="flex gap-2">
                                  <span className="text-muted-foreground">{row.label}:</span>
                                  <span className="truncate text-foreground">{row.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <details className="rounded border border-border bg-background/40 p-2" open>
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attributes</summary>
                          <pre className="mt-2 overflow-auto text-xs text-foreground">{JSON.stringify(attrs, null, 2)}</pre>
                        </details>

                        <details className="rounded border border-border bg-background/40 p-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resource Attributes</summary>
                          <pre className="mt-2 overflow-auto text-xs text-foreground">{JSON.stringify(resourceAttrs, null, 2)}</pre>
                        </details>

                        <details className="rounded border border-border bg-background/40 p-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool Input (foldable)</summary>
                          <pre className="mt-2 overflow-auto text-xs text-foreground">{toolInput == null ? '(none)' : JSON.stringify(toolInput, null, 2)}</pre>
                        </details>

                        <details className="rounded border border-border bg-background/40 p-2">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tool Output (foldable)</summary>
                          <pre className="mt-2 overflow-auto text-xs text-foreground">{toolOutput == null ? '(none)' : JSON.stringify(toolOutput, null, 2)}</pre>
                        </details>

                        <details className="rounded border border-border bg-background/40 p-2" open>
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Events ({selectedSpanEvents.length})</summary>
                          {selectedSpanEvents.length === 0 ? (
                            <div className="mt-2 text-xs text-muted-foreground">(none)</div>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {selectedSpanEvents.map((event, idx) => {
                                const offset = spanStart != null && event.timeUnixNano != null ? event.timeUnixNano - spanStart : null;
                                return (
                                  <div key={`${event.name}-${idx}`} className="rounded border border-border/70 p-2">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <div className="font-mono text-xs text-foreground">{offset == null ? 'offset: -' : `offset: ${formatOffsetMs(offset)}`}</div>
                                      <Badge variant={eventVariant(event.name)}>{event.name}</Badge>
                                    </div>
                                    <pre className="overflow-auto text-xs text-muted-foreground">{JSON.stringify(event.attributes, null, 2)}</pre>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </details>

                        <div className="rounded border border-border bg-background/40 p-2 text-xs">
                          <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">LLM token usage</div>
                          <div className="font-mono text-foreground">input: {inputTokens ?? '-'}</div>
                          <div className="font-mono text-foreground">output: {outputTokens ?? '-'}</div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </aside>
            </section>
          </section>
        </div>
      </main>
    </TooltipProvider>
  );
}
