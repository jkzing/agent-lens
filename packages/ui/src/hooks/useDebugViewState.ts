import { useEffect, useMemo, useState } from 'react';
import { buildEventTypeCoverage, buildEventTypeOptions, buildSpanEventTypeOptions, filterSpansForTimeline, filterTracesByEventType } from '@/features/debug/traceFilters';
import { getTimelineTicks } from '@/features/debug/utils';
import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';

type SpanEvent = {
  name: string;
  timeUnixNano: number | null;
  attributes: Record<string, unknown>;
};

type SpanKindType = 'llm' | 'tool' | 'internal';

type ModelCostStat = {
  key: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

type PricingRule = {
  key: string;
  matchers: string[];
  inputPerToken: number;
  outputPerToken: number;
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

function normalizeValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
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

function withinRange(iso: string, range: 'all' | '15m' | '1h' | '24h'): boolean {
  if (range === 'all') return true;
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (range === '15m') return diff <= 15 * 60 * 1000;
  if (range === '1h') return diff <= 60 * 60 * 1000;
  if (range === '24h') return diff <= 24 * 60 * 1000;
  return true;
}

export function parseJsonObject(input: string | null): Record<string, any> {
  if (!input) return {};
  try {
    const obj = JSON.parse(input);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function detectSpanType(span: SpanRow, attrs: Record<string, any>): SpanKindType {
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

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type UseDebugViewStateInput = {
  traces: TraceSummary[];
  spans: SpanRow[];
  range: 'all' | '15m' | '1h' | '24h';
  agentFilter: string;
  selectedTraceId: string | null;
  setSelectedTraceId: (traceId: string | null) => void;
  selectedSpanId: number | null;
  setSelectedSpanId: (id: number | null) => void;
};

export function useDebugViewState({
  traces,
  spans,
  range,
  agentFilter,
  selectedTraceId,
  setSelectedTraceId,
  selectedSpanId,
  setSelectedSpanId,
}: UseDebugViewStateInput) {
  const [traceSearch, setTraceSearch] = useState('');
  const [traceEventTypeFilter, setTraceEventTypeFilter] = useState('all');
  const [spanSearch, setSpanSearch] = useState('');
  const [spanEventTypeFilter, setSpanEventTypeFilter] = useState('all');
  const [tracesCollapsed, setTracesCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  useEffect(() => {
    setSpanSearch('');
    setSpanEventTypeFilter('all');
  }, [selectedTraceId]);

  const tracesBeforeEventTypeFilter = useMemo(
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

  const traceEventTypeOptions = useMemo(() => buildEventTypeOptions(tracesBeforeEventTypeFilter), [tracesBeforeEventTypeFilter]);
  const traceEventTypeCoverage = useMemo(() => buildEventTypeCoverage(tracesBeforeEventTypeFilter), [tracesBeforeEventTypeFilter]);

  useEffect(() => {
    if (traceEventTypeFilter !== 'all' && !traceEventTypeOptions.includes(traceEventTypeFilter)) {
      setTraceEventTypeFilter('all');
    }
  }, [traceEventTypeFilter, traceEventTypeOptions]);

  const filteredTraces = useMemo(
    () => filterTracesByEventType(tracesBeforeEventTypeFilter, traceEventTypeFilter),
    [tracesBeforeEventTypeFilter, traceEventTypeFilter]
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
      }
      return;
    }

    if (!selectedTraceId || !filteredTraces.some((t) => t.trace_id === selectedTraceId)) {
      setSelectedTraceId(filteredTraces[0].trace_id);
    }
  }, [filteredTraces, selectedTraceId, setSelectedTraceId]);

  const selectedTrace = filteredTraces.find((t) => t.trace_id === selectedTraceId) || null;

  const spanEventTypeOptions = useMemo(() => buildSpanEventTypeOptions(spans), [spans]);

  useEffect(() => {
    if (spanEventTypeFilter !== 'all' && !spanEventTypeOptions.includes(spanEventTypeFilter)) {
      setSpanEventTypeFilter('all');
    }
  }, [spanEventTypeFilter, spanEventTypeOptions]);

  const filteredSpans = useMemo(
    () => filterSpansForTimeline(spans, spanSearch, spanEventTypeFilter),
    [spans, spanSearch, spanEventTypeFilter]
  );

  useEffect(() => {
    if (filteredSpans.length === 0) {
      setSelectedSpanId(null);
      return;
    }

    if (selectedSpanId == null || !filteredSpans.some((span) => span.id === selectedSpanId)) {
      setSelectedSpanId(filteredSpans[0].id);
    }
  }, [filteredSpans, selectedSpanId, setSelectedSpanId]);

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
  const timelineCanvasWidth = useMemo(() => Math.max(980, Math.min(2600, 720 + filteredSpans.length * 18)), [filteredSpans.length]);
  const timelineRowHeight = 32;
  const timelineHeaderHeight = 32;
  const nameColumnWidth = 260;
  const selectedSpanEvents = useMemo(() => parseSpanEvents(selectedSpan?.events ?? null), [selectedSpan]);
  const selectedSpanContextRows = useMemo(() => (selectedSpan ? buildSpanContextRows(selectedSpan) : []), [selectedSpan]);

  return {
    traceSearch,
    setTraceSearch,
    traceEventTypeFilter,
    setTraceEventTypeFilter,
    traceEventTypeOptions,
    traceEventTypeCoverage,
    spanSearch,
    setSpanSearch,
    spanEventTypeFilter,
    setSpanEventTypeFilter,
    spanEventTypeOptions,
    tracesCollapsed,
    setTracesCollapsed,
    detailCollapsed,
    setDetailCollapsed,
    filteredTraces,
    tracesByAgent,
    selectedTrace,
    filteredSpans,
    selectedSpan,
    selectedSpanEvents,
    selectedSpanContextRows,
    suspiciousLoopSpanIds,
    traceCostStats,
    timelineMeta,
    ticks,
    timelineCanvasWidth,
    timelineRowHeight,
    timelineHeaderHeight,
    nameColumnWidth,
  };
}
