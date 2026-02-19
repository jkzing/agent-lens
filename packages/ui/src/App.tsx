import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Bot, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Reply, Send, Wrench } from 'lucide-react';
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

function hasFollowingAtDepth(spans: SpanRow[], index: number, depth: number): boolean {
  for (let i = index + 1; i < spans.length; i += 1) {
    const nextDepth = spans[i].depth;
    if (nextDepth < depth) return false;
    if (nextDepth === depth) return true;
  }
  return false;
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

function statusBadgeVariant(status: 'success' | 'running' | 'error' | 'waiting'): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'success') return 'success';
  if (status === 'running') return 'warning';
  if (status === 'error') return 'destructive';
  return 'outline';
}

function detectActor(name: string): 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System' {
  const n = (name || '').toLowerCase();
  if (n.includes('human') || n.includes('user') || n.includes('kai')) return 'Human';
  if (n.includes('lumi')) return 'Lumi';
  if (n.includes('nyx')) return 'Nyx';
  if (n.includes('runa')) return 'Runa';
  return 'System';
}

function stepIcon(type: string, status: string) {
  if (status === 'error') return AlertTriangle;
  if (type.toLowerCase().includes('tool')) return Wrench;
  if (type.toLowerCase().includes('llm')) return Bot;
  if (type.toLowerCase().includes('reply')) return Reply;
  return Send;
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

type OverviewStep = {
  id: number;
  index: number;
  fromActor: string;
  toActor: string;
  fromLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System';
  toLane: 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System';
  actionType: string;
  status: 'success' | 'running' | 'error' | 'waiting';
  duration: string;
  durationNs: number;
  inputSummary: string;
  outputSummary: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  attrs: Record<string, any>;
  modelInfo: { provider: string; model: string };
  errorMessage: string | null;
  startedAt: number;
  timestamp: string;
};

function createMockScenario(baseIso: string, rows: Array<{
  from: string;
  to: string;
  type: string;
  status: 'success' | 'running' | 'error' | 'waiting';
  durationMs: number;
  offsetMs: number;
  input: string;
  output: string;
  error?: string;
  attrs?: Record<string, any>;
  tokens?: { in: number; out: number; provider?: string; model?: string };
}>): OverviewStep[] {
  return rows.map((row, idx) => {
    const ts = new Date(new Date(baseIso).getTime() + row.offsetMs).toISOString();
    const inTokens = row.tokens?.in ?? 0;
    const outTokens = row.tokens?.out ?? 0;
    const provider = row.tokens?.provider ?? 'unknown';
    const model = row.tokens?.model ?? 'unknown';
    return {
      id: 10_000 + idx,
      index: idx + 1,
      fromActor: row.from,
      toActor: row.to,
      fromLane: detectActor(row.from),
      toLane: detectActor(row.to),
      actionType: row.type,
      status: row.status,
      duration: `${row.durationMs} ms`,
      durationNs: row.durationMs * 1_000_000,
      inputSummary: row.input,
      outputSummary: row.output,
      inputTokens: inTokens,
      outputTokens: outTokens,
      cost: estimateCost(inTokens, outTokens, provider, model),
      attrs: {
        ...row.attrs,
        'mock.input': row.input,
        'mock.output': row.output,
        ...(row.error ? { 'error.message': row.error } : {}),
      },
      modelInfo: { provider, model },
      errorMessage: row.error ?? null,
      startedAt: new Date(ts).getTime() * 1_000_000,
      timestamp: ts,
    };
  });
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
  const [tracesCollapsed, setTracesCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [selectedOverviewStepId, setSelectedOverviewStepId] = useState<number | null>(null);
  const [overviewShowRaw, setOverviewShowRaw] = useState(false);
  const [overviewHoverStepId, setOverviewHoverStepId] = useState<number | null>(null);
  const [overviewActorFilter, setOverviewActorFilter] = useState<'all' | 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System'>('all');
  const [overviewTimeFilter, setOverviewTimeFilter] = useState<'all' | '5m' | '1h' | '24h'>('all');
  const [overviewDataMode, setOverviewDataMode] = useState<'live' | 'demo-happy' | 'demo-handoff' | 'demo-recovery'>('live');

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
      .map((s) => (s.start_time_unix_nano != null ? Number(s.start_time_unix_nano) : null))
      .filter((v): v is number => Number.isFinite(v));

    const minStart = starts.length ? Math.min(...starts) : 0;

    const ends = spans
      .map((s) => {
        const start = s.start_time_unix_nano != null ? Number(s.start_time_unix_nano) : null;
        if (start == null || !Number.isFinite(start)) return null;

        const end = s.end_time_unix_nano != null ? Number(s.end_time_unix_nano) : null;
        if (end != null && Number.isFinite(end)) return end;

        const duration = s.duration_ns != null ? Number(s.duration_ns) : null;
        if (duration != null && Number.isFinite(duration) && duration > 0) return start + duration;

        return null;
      })
      .filter((v): v is number => Number.isFinite(v));

    const maxEnd = ends.length ? Math.max(...ends) : minStart + 1;
    const total = Math.max(1, maxEnd - minStart);

    return { minStart, maxEnd, total };
  }, [spans]);

  const ticks = useMemo(() => getTimelineTicks(timelineMeta.total), [timelineMeta.total]);
  const timelineCanvasWidth = useMemo(() => Math.max(980, Math.min(2600, 720 + spans.length * 18)), [spans.length]);
  const timelineRowHeight = 32;
  const timelineHeaderHeight = 32;
  const nameColumnWidth = 260;
  const selectedSpanEvents = useMemo(() => parseSpanEvents(selectedSpan?.events ?? null), [selectedSpan]);
  const selectedSpanContextRows = useMemo(() => (selectedSpan ? buildSpanContextRows(selectedSpan) : []), [selectedSpan]);

  const spanById = useMemo(() => {
    const m = new Map<string, SpanRow>();
    for (const span of spans) {
      if (span.span_id) m.set(span.span_id, span);
    }
    return m;
  }, [spans]);

  const overviewSteps = useMemo<OverviewStep[]>(() => {
    const summarize = (attrs: Record<string, any>, keys: string[], fallback = '(none)') => {
      for (const key of keys) {
        const value = attrs[key];
        if (value == null) continue;
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (text && text.trim()) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
      }
      return fallback;
    };

    return spans.map((span, index) => {
      const attrs = parseJsonObject(span.attributes);
      const parent = span.parent_span_id ? spanById.get(span.parent_span_id) : null;
      const spanType = detectSpanType(span, attrs);
      const status: 'success' | 'running' | 'error' | 'waiting' = span.status_code === 2 ? 'error' : span.end_time_unix_nano ? 'success' : (span.parent_span_id ? 'waiting' : 'running');
      const fromActor = parent?.name || 'system';
      const toActor = span.name || 'unknown';
      const fromLane = detectActor(fromActor);
      const toLane = detectActor(toActor);
      const inputSummary = summarize(attrs, ['tool.input', 'tool.arguments', 'input', 'gen_ai.content.prompt', 'prompt']);
      const outputSummary = summarize(attrs, ['tool.output', 'output', 'gen_ai.content.completion', 'completion']);
      const inputTokens = toNumber(attrs['gen_ai.usage.input_tokens']);
      const outputTokens = toNumber(attrs['gen_ai.usage.output_tokens']);
      const modelInfo = getSpanModelInfo(span);
      const cost = estimateCost(inputTokens, outputTokens, modelInfo.provider, modelInfo.model);
      const actionType = spanType === 'tool' ? 'Tool Call' : spanType === 'llm' ? 'LLM Call' : 'Internal';

      return {
        id: span.id,
        index: index + 1,
        fromActor,
        toActor,
        fromLane,
        toLane,
        actionType,
        status,
        duration: formatDurationNs(span.duration_ns),
        durationNs: span.duration_ns ?? 0,
        inputSummary,
        outputSummary,
        inputTokens,
        outputTokens,
        cost,
        attrs,
        modelInfo,
        errorMessage: span.status_code === 2 ? (attrs['error.message'] || attrs['exception.message'] || 'Span failed') : null,
        startedAt: span.start_time_unix_nano ? Number(span.start_time_unix_nano) : 0,
        timestamp: span.received_at
      };
    }).sort((a, b) => a.startedAt - b.startedAt || a.id - b.id);
  }, [spans, spanById]);

  const overviewMockScenarios = useMemo(() => {
    const base = new Date().toISOString();
    return {
      'demo-happy': createMockScenario(base, [
        { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 120, offsetMs: 0, input: 'Ask for yesterday KPI summary', output: 'Intent parsed + requirements captured' },
        { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 380, offsetMs: 400, input: 'Delegate data fetch & compose report', output: 'Task accepted with context', attrs: { handoff: true } },
        { from: 'Nyx', to: 'System', type: 'tool', status: 'success', durationMs: 920, offsetMs: 1100, input: 'Query analytics DB for KPI window', output: 'Received KPI rows and deltas' },
        { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 260, offsetMs: 2200, input: 'Provide formatted KPI bullets', output: 'Delivered concise report draft' },
        { from: 'Lumi', to: 'Human', type: 'reply', status: 'success', durationMs: 140, offsetMs: 2600, input: 'Render final summary', output: 'Summary sent to user', tokens: { in: 320, out: 180, provider: 'openai', model: 'gpt-4.1' } },
      ]),
      'demo-handoff': createMockScenario(base, [
        { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 150, offsetMs: 0, input: 'Implement UI polish + bugfix', output: 'Task scoped into subtasks' },
        { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 290, offsetMs: 500, input: 'Hotfix timeline alignment', output: 'Nyx starts coding', attrs: { handoff: 'Lumi->Nyx' } },
        { from: 'Nyx', to: 'Runa', type: 'run', status: 'waiting', durationMs: 80, offsetMs: 950, input: 'Ask Runa to verify visual regressions', output: 'Awaiting verification response', attrs: { handoff: 'Nyx->Runa' } },
        { from: 'Runa', to: 'System', type: 'tool', status: 'running', durationMs: 1800, offsetMs: 1300, input: 'Run screenshot comparison job', output: 'Comparing baseline vs current build' },
        { from: 'Runa', to: 'Nyx', type: 'reply', status: 'success', durationMs: 260, offsetMs: 3400, input: 'Send validation findings', output: 'No blocker; minor spacing note' },
        { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 180, offsetMs: 3900, input: 'Return merged patch + notes', output: 'Patch ready to ship' },
      ]),
      'demo-recovery': createMockScenario(base, [
        { from: 'Human', to: 'Lumi', type: 'send', status: 'success', durationMs: 110, offsetMs: 0, input: 'Generate release note digest', output: 'Plan drafted' },
        { from: 'Lumi', to: 'Nyx', type: 'run', status: 'success', durationMs: 240, offsetMs: 320, input: 'Collect PR metadata and summarize', output: 'Execution started' },
        { from: 'Nyx', to: 'System', type: 'tool', status: 'error', durationMs: 740, offsetMs: 820, input: 'Fetch PR data from API', output: 'HTTP 502 from upstream', error: 'Gateway timeout while calling GitHub API' },
        { from: 'Nyx', to: 'System', type: 'tool', status: 'success', durationMs: 910, offsetMs: 1900, input: 'Retry fetch with fallback mirror', output: 'Recovered data from mirror endpoint', attrs: { retry: 1 } },
        { from: 'Nyx', to: 'Lumi', type: 'reply', status: 'success', durationMs: 220, offsetMs: 3000, input: 'Send recovered summary draft', output: 'Summary accepted after retry' },
        { from: 'Lumi', to: 'Human', type: 'reply', status: 'success', durationMs: 130, offsetMs: 3380, input: 'Deliver final digest', output: 'User received release digest', tokens: { in: 280, out: 160, provider: 'anthropic', model: 'claude-sonnet-4' } },
      ]),
    } as const;
  }, []);

  const effectiveOverviewMode = overviewDataMode === 'live' && overviewSteps.length === 0 ? 'demo-recovery' : overviewDataMode;
  const activeOverviewSteps = effectiveOverviewMode === 'live' ? overviewSteps : overviewMockScenarios[effectiveOverviewMode];

  const filteredOverviewSteps = useMemo(() => {
    return activeOverviewSteps.filter((step) => {
      if (overviewActorFilter !== 'all' && step.fromLane !== overviewActorFilter && step.toLane !== overviewActorFilter) return false;
      if (overviewTimeFilter === 'all') return true;
      const ageMs = Date.now() - new Date(step.timestamp).getTime();
      if (overviewTimeFilter === '5m') return ageMs <= 5 * 60 * 1000;
      if (overviewTimeFilter === '1h') return ageMs <= 60 * 60 * 1000;
      if (overviewTimeFilter === '24h') return ageMs <= 24 * 60 * 60 * 1000;
      return true;
    });
  }, [activeOverviewSteps, overviewActorFilter, overviewTimeFilter]);

  const selectedOverviewStep = filteredOverviewSteps.find((s) => s.id === selectedOverviewStepId) || filteredOverviewSteps[0] || null;

  const overviewKpis = useMemo(() => {
    const total = filteredOverviewSteps.length;
    const success = filteredOverviewSteps.filter((s) => s.status === 'success').length;
    const blocked = filteredOverviewSteps.filter((s) => s.status === 'waiting' || s.status === 'running').length;
    const avgDurationNs = total > 0 ? filteredOverviewSteps.reduce((sum, s) => sum + s.durationNs, 0) / total : 0;
    return {
      total,
      successRate: total > 0 ? (success / total) * 100 : 0,
      avgDuration: formatDurationNs(avgDurationNs || 0),
      blocked
    };
  }, [filteredOverviewSteps]);

  useEffect(() => {
    if (filteredOverviewSteps.length === 0) {
      setSelectedOverviewStepId(null);
      return;
    }
    if (!selectedOverviewStepId || !filteredOverviewSteps.some((s) => s.id === selectedOverviewStepId)) {
      setSelectedOverviewStepId(filteredOverviewSteps[0].id);
    }
  }, [filteredOverviewSteps, selectedOverviewStepId]);

  const laneOrder = ['Human', 'Lumi', 'Nyx', 'Runa', 'System'] as const;
  const laneIndex = (lane: string) => {
    const idx = laneOrder.indexOf(lane as (typeof laneOrder)[number]);
    return idx >= 0 ? idx : laneOrder.length - 1;
  };

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

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0 space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      value={overviewTimeFilter}
                      onChange={(e) => setOverviewTimeFilter(e.target.value as 'all' | '5m' | '1h' | '24h')}
                    >
                      <option value="all">All time</option>
                      <option value="5m">Last 5m</option>
                      <option value="1h">Last 1h</option>
                      <option value="24h">Last 24h</option>
                    </select>
                    <select
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      value={overviewActorFilter}
                      onChange={(e) => setOverviewActorFilter(e.target.value as 'all' | 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System')}
                    >
                      <option value="all">All actors</option>
                      <option value="Human">Human</option>
                      <option value="Lumi">Lumi</option>
                      <option value="Nyx">Nyx</option>
                      <option value="Runa">Runa</option>
                      <option value="System">System</option>
                    </select>
                    <select
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                      value={overviewDataMode}
                      onChange={(e) => setOverviewDataMode(e.target.value as 'live' | 'demo-happy' | 'demo-handoff' | 'demo-recovery')}
                    >
                      <option value="live">Live data</option>
                      <option value="demo-happy">Demo: happy path</option>
                      <option value="demo-handoff">Demo: multi-agent handoff</option>
                      <option value="demo-recovery">Demo: error + retry recovery</option>
                    </select>
                  </div>
                  {overviewDataMode === 'live' && effectiveOverviewMode !== 'live' ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Live trace data is empty, auto-fallback to demo scenario: error + retry recovery.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total interactions</div><div className="text-2xl font-semibold">{overviewKpis.total}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Success rate</div><div className="text-2xl font-semibold">{overviewKpis.successRate.toFixed(0)}%</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg duration</div><div className="text-2xl font-semibold">{overviewKpis.avgDuration}</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Blocked now</div><div className="text-2xl font-semibold">{overviewKpis.blocked}</div></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Interaction Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[calc(100vh-360px)] rounded border border-border bg-background/30 [&_[data-radix-scroll-area-viewport]]:overflow-x-auto [&_[data-radix-scroll-area-viewport]]:overflow-y-auto">
                      <div className="min-w-[900px] p-3">
                        <div className="grid grid-cols-5 gap-2">
                          {laneOrder.map((lane) => (
                            <div key={lane} className="rounded-md border border-border bg-background/60 px-2 py-1 text-center text-xs font-semibold text-muted-foreground">{lane}</div>
                          ))}
                        </div>

                        {filteredOverviewSteps.length === 0 ? (
                          <div className="mt-4 rounded border border-border bg-background/40 p-3 text-sm text-muted-foreground">No interaction steps under current filters.</div>
                        ) : (
                          <div className="relative mt-3" style={{ height: `${filteredOverviewSteps.length * 86 + 24}px` }}>
                            <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
                              <defs>
                                <marker id="arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                                  <path d="M0,0 L0,6 L6,3 z" fill="currentColor" />
                                </marker>
                              </defs>
                              {filteredOverviewSteps.map((step, idx) => {
                                if (idx === 0) return null;
                                const prev = filteredOverviewSteps[idx - 1];
                                const x1 = ((laneIndex(prev.toLane) + 0.5) / laneOrder.length) * 100;
                                const x2 = ((laneIndex(step.toLane) + 0.5) / laneOrder.length) * 100;
                                const y1 = idx * 86 - 30;
                                const y2 = idx * 86 + 8;
                                const highlighted = overviewHoverStepId === step.id || overviewHoverStepId === prev.id;
                                return (
                                  <line
                                    key={`link-${prev.id}-${step.id}`}
                                    x1={`${x1}%`}
                                    y1={y1}
                                    x2={`${x2}%`}
                                    y2={y2}
                                    stroke={highlighted ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                                    strokeWidth={highlighted ? 2 : 1}
                                    markerEnd="url(#arrow-head)"
                                    className="transition-all duration-150"
                                  />
                                );
                              })}
                            </svg>

                            {filteredOverviewSteps.map((step, idx) => {
                              const Icon = stepIcon(step.actionType, step.status);
                              const lane = laneIndex(step.toLane);
                              const leftPct = ((lane + 0.5) / laneOrder.length) * 100;
                              const isFocus = overviewHoverStepId === step.id || selectedOverviewStep?.id === step.id;
                              return (
                                <button
                                  key={step.id}
                                  onMouseEnter={() => setOverviewHoverStepId(step.id)}
                                  onMouseLeave={() => setOverviewHoverStepId(null)}
                                  onClick={() => setSelectedOverviewStepId(step.id)}
                                  className={cn(
                                    'absolute -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-left shadow-sm transition-all duration-150',
                                    isFocus ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-ring/60'
                                  )}
                                  style={{ left: `${leftPct}%`, top: `${idx * 86}px`, width: '220px' }}
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1 text-xs font-medium"><Icon className="h-3.5 w-3.5" /> {step.fromLane} → {step.toLane}</span>
                                    <Badge variant={statusBadgeVariant(step.status)}>{step.status}</Badge>
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">{step.actionType}</div>
                                  <div className="truncate text-sm">{step.inputSummary} → {step.outputSummary}</div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">{step.duration}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="xl:sticky xl:top-4 h-fit">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Step Detail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {!selectedOverviewStep ? (
                      <p className="text-muted-foreground">Select a step to inspect details.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-1 text-xs font-mono text-muted-foreground">
                          <div>from/to: {selectedOverviewStep.fromLane} → {selectedOverviewStep.toLane}</div>
                          <div>type: {selectedOverviewStep.actionType}</div>
                          <div>status: {selectedOverviewStep.status}</div>
                          <div>duration: {selectedOverviewStep.duration}</div>
                          <div>timestamp: {new Date(selectedOverviewStep.timestamp).toLocaleString()}</div>
                          {(selectedOverviewStep.inputTokens > 0 || selectedOverviewStep.outputTokens > 0) ? (
                            <>
                              <div>tokens: in {selectedOverviewStep.inputTokens} / out {selectedOverviewStep.outputTokens}</div>
                              <div className="text-emerald-600 dark:text-emerald-400">cost: ${selectedOverviewStep.cost.toFixed(6)}</div>
                            </>
                          ) : null}
                        </div>

                        <div className="rounded border border-border bg-background/40 p-2">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input Summary</div>
                          <div>{selectedOverviewStep.inputSummary}</div>
                        </div>
                        <div className="rounded border border-border bg-background/40 p-2">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output Summary</div>
                          <div>{selectedOverviewStep.outputSummary}</div>
                        </div>

                        {selectedOverviewStep.errorMessage ? (
                          <div className="rounded border border-destructive/40 bg-destructive/15 p-2 text-destructive">
                            {selectedOverviewStep.errorMessage}
                          </div>
                        ) : null}

                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <input type="checkbox" checked={overviewShowRaw} onChange={(e) => setOverviewShowRaw(e.target.checked)} />
                          Show raw
                        </label>

                        {overviewShowRaw ? (
                          <pre className="max-h-64 overflow-auto rounded border border-border bg-background/40 p-2 text-xs text-foreground">
                            {JSON.stringify(selectedOverviewStep.attrs, null, 2)}
                          </pre>
                        ) : null}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="debug" className="mt-0">
          <section
            className={cn(
              'grid grid-cols-1 gap-4',
              tracesCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[320px_minmax(0,1fr)]'
            )}
          >
            {!tracesCollapsed ? (
              <aside className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex h-9 items-center">
                    <h2 className="text-lg font-semibold">Traces ({filteredTraces.length})</h2>
                  </div>
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
            ) : null}

            <section
              className={cn(
                'min-w-0 grid grid-cols-1 gap-4',
                detailCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_360px]'
              )}
            >
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex h-9 items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setTracesCollapsed((v) => !v)}>
                          {tracesCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{tracesCollapsed ? 'Show Traces' : 'Hide Traces'}</TooltipContent>
                    </Tooltip>
                    <h2 className="text-lg font-semibold">Trace Timeline</h2>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetailCollapsed((v) => !v)}>
                          {detailCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{detailCollapsed ? 'Show Details' : 'Hide Details'}</TooltipContent>
                    </Tooltip>
                  </div>
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

                    <div className="h-[calc(100vh-470px)] overflow-y-auto rounded border border-border bg-background/30">
                      <div className="flex min-w-0">
                        <div className="shrink-0 border-r border-border bg-background/40" style={{ width: `${nameColumnWidth}px` }}>
                          <div className="sticky top-0 z-20 flex items-center border-b border-border bg-background/80 px-3 text-xs font-medium text-muted-foreground backdrop-blur" style={{ height: `${timelineHeaderHeight}px` }}>
                            Span
                          </div>
                          {spans.map((span, index) => {
                            const attrs = parseJsonObject(span.attributes);
                            const type = detectSpanType(span, attrs);
                            const indent = span.depth * 12;

                            return (
                              <button
                                key={span.id}
                                onClick={() => setSelectedSpanId(span.id)}
                                className={cn(
                                  'relative block w-full border-b border-border/60 px-2 text-left transition last:border-b-0',
                                  selectedSpanId === span.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                                )}
                                style={{ height: `${timelineRowHeight}px` }}
                              >
                                {span.depth > 0 ? (
                                  <div className="pointer-events-none absolute inset-0">
                                    {Array.from({ length: span.depth }).map((_, levelIndex) => {
                                      const level = levelIndex + 1;
                                      const left = (level - 1) * 12 + 6;
                                      const hasNext = hasFollowingAtDepth(spans, index, level);
                                      const lineColor = 'hsl(var(--muted-foreground) / 0.5)';

                                      if (level === span.depth) {
                                        return (
                                          <div key={`elbow-${span.id}-${level}`} className="absolute" style={{ left: `${left}px`, top: 0, width: '12px', height: '100%' }}>
                                            <div className="absolute" style={{ left: 0, top: 0, height: '50%', borderLeft: `1px solid ${lineColor}` }} />
                                            {hasNext ? (
                                              <div className="absolute" style={{ left: 0, top: '50%', bottom: 0, borderLeft: `1px solid ${lineColor}` }} />
                                            ) : null}
                                            <div className="absolute" style={{ left: 0, top: '50%', width: '12px', borderTop: `1px solid ${lineColor}` }} />
                                          </div>
                                        );
                                      }

                                      if (!hasNext) return null;
                                      return <div key={`line-${span.id}-${level}`} className="absolute" style={{ left: `${left}px`, top: 0, bottom: 0, borderLeft: `1px solid ${lineColor}` }} />;
                                    })}
                                  </div>
                                ) : null}

                                <div className="flex h-full items-center gap-2" style={{ paddingLeft: `${indent + 8}px` }}>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', type === 'llm' ? 'bg-violet-500' : type === 'tool' ? 'bg-cyan-500' : 'bg-slate-500')} />
                                  <span className="truncate text-sm">{span.name || 'unknown'}</span>
                                  {suspiciousLoopSpanIds.has(span.id) ? (
                                    <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">loop?</span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="min-w-0 flex-1 overflow-x-auto">
                          <div className="relative" style={{ width: `${timelineCanvasWidth}px`, minWidth: '100%' }}>
                            <div className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur" style={{ height: `${timelineHeaderHeight}px` }}>
                              {ticks.map((tickNs, idx) => {
                                const leftPct = (tickNs / timelineMeta.total) * 100;
                                const labelTransform = leftPct < 6 ? 'translateX(0)' : leftPct > 94 ? 'translateX(-100%)' : 'translateX(-50%)';
                                return (
                                  <div key={`${tickNs}-${idx}`}>
                                    <div className="absolute top-0 h-full w-px border-l border-dashed border-border/70" style={{ left: `${leftPct}%` }} />
                                    <div className="absolute bottom-1 text-[10px] whitespace-nowrap text-muted-foreground" style={{ left: `${leftPct}%`, transform: labelTransform }}>
                                      {formatTick(tickNs)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="absolute inset-0 top-0 pointer-events-none">
                              {ticks.map((tickNs, idx) => {
                                const leftPct = (tickNs / timelineMeta.total) * 100;
                                return <div key={`grid-${tickNs}-${idx}`} className="absolute top-0 h-full w-px border-l border-dashed border-border/50" style={{ left: `${leftPct}%` }} />;
                              })}
                            </div>

                            <div className="relative">
                              {spans.map((span) => {
                                const attrs = parseJsonObject(span.attributes);
                                const type = detectSpanType(span, attrs);
                                const rawStart = span.start_time_unix_nano != null ? Number(span.start_time_unix_nano) : timelineMeta.minStart;
                                const start = Number.isFinite(rawStart) ? rawStart : timelineMeta.minStart;
                                const rawEnd = span.end_time_unix_nano != null ? Number(span.end_time_unix_nano) : null;
                                const durationNs = span.duration_ns != null ? Number(span.duration_ns) : null;
                                const hasDuration = durationNs != null && Number.isFinite(durationNs) && durationNs > 0;
                                const end = rawEnd != null && Number.isFinite(rawEnd) ? rawEnd : (hasDuration ? start + (durationNs ?? 0) : start);
                                const left = ((start - timelineMeta.minStart) / timelineMeta.total) * 100;
                                const computedWidthPct = ((Math.max(end, start + 1) - start) / timelineMeta.total) * 100;
                                const isPointSpan = !hasDuration;
                                const width = Math.max(0.5, computedWidthPct);

                                return (
                                  <button
                                    key={span.id}
                                    onClick={() => setSelectedSpanId(span.id)}
                                    className={cn(
                                      'relative block w-full border-b border-border/60 px-2 text-left transition last:border-b-0',
                                      selectedSpanId === span.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                                    )}
                                    style={{ height: `${timelineRowHeight}px` }}
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={cn(
                                            'absolute top-1/2 h-4 -translate-y-1/2 rounded-sm',
                                            type === 'llm' ? 'bg-violet-500/80' : type === 'tool' ? 'bg-cyan-500/80' : 'bg-slate-500/80',
                                            suspiciousLoopSpanIds.has(span.id) && 'ring-1 ring-amber-400'
                                          )}
                                          style={isPointSpan ? { left: `${left}%`, width: '4px' } : { left: `${left}%`, width: `${width}%` }}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="space-y-1">
                                          <div className="font-semibold">{span.name || 'unknown'}</div>
                                          <div>duration: {formatDurationNs(span.duration_ns)}</div>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!detailCollapsed ? (
              <aside className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex h-9 items-center">
                      <h2 className="text-lg font-semibold">Details</h2>
                    </div>
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
              ) : null}
            </section>
          </section>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </TooltipProvider>
  );
}
