import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTraceData, type SpanRow } from '@/hooks/useTraceData';
import { detectSpanType, parseJsonObject, toNumber, useDebugViewState } from '@/hooks/useDebugViewState';
import { DebugPanel } from '@/features/debug/DebugPanel';
import { exportTrace, formatOffsetMs, formatTick } from '@/features/debug/utils';
import { OverviewPanel, type OverviewStep } from '@/features/overview/OverviewPanel';

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

function formatDurationNs(durationNs: number | null): string {
  if (durationNs == null) return '-';
  if (durationNs < 1_000) return `${durationNs} ns`;
  if (durationNs < 1_000_000) return `${(durationNs / 1_000).toFixed(2)} μs`;
  if (durationNs < 1_000_000_000) return `${(durationNs / 1_000_000).toFixed(2)} ms`;
  return `${(durationNs / 1_000_000_000).toFixed(2)} s`;
}

function detectActor(name: string): 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System' {
  const n = (name || '').toLowerCase();
  if (n.includes('human') || n.includes('user') || n.includes('kai')) return 'Human';
  if (n.includes('lumi')) return 'Lumi';
  if (n.includes('nyx')) return 'Nyx';
  if (n.includes('runa')) return 'Runa';
  return 'System';
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
  const [range, setRange] = useState<'all' | '15m' | '1h' | '24h'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [selectedOverviewStepId, setSelectedOverviewStepId] = useState<number | null>(null);
  const [overviewShowRaw, setOverviewShowRaw] = useState(false);
  const [overviewHoverStepId, setOverviewHoverStepId] = useState<number | null>(null);
  const [overviewActorFilter, setOverviewActorFilter] = useState<'all' | 'Human' | 'Lumi' | 'Nyx' | 'Runa' | 'System'>('all');
  const [overviewTimeFilter, setOverviewTimeFilter] = useState<'all' | '5m' | '1h' | '24h'>('all');
  const [overviewDataMode, setOverviewDataMode] = useState<'live' | 'demo-happy' | 'demo-handoff' | 'demo-recovery'>('live');

  const {
    traces,
    selectedTraceId,
    setSelectedTraceId,
    spans,
    selectedSpanId,
    setSelectedSpanId,
    loading,
    error,
    setError,
    refreshAll
  } = useTraceData(autoRefresh);

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const trace of traces) {
      (trace.service_names || []).forEach((name) => set.add(name));
      if (trace.primary_service_name) set.add(trace.primary_service_name);
    }
    return Array.from(set).sort();
  }, [traces]);

  const {
    traceSearch,
    setTraceSearch,
    spanSearch,
    setSpanSearch,
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
  } = useDebugViewState({
    traces,
    spans,
    range,
    agentFilter,
    selectedTraceId,
    setSelectedTraceId,
    selectedSpanId,
    setSelectedSpanId,
  });

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
      if (overviewTimeFilter === '24h') return ageMs <= 24 * 60 * 1000;
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

            <TabsContent value="overview" className="mt-0">
              <OverviewPanel
                overviewTimeFilter={overviewTimeFilter}
                setOverviewTimeFilter={setOverviewTimeFilter}
                overviewActorFilter={overviewActorFilter}
                setOverviewActorFilter={setOverviewActorFilter}
                overviewDataMode={overviewDataMode}
                setOverviewDataMode={setOverviewDataMode}
                effectiveOverviewMode={effectiveOverviewMode}
                overviewKpis={overviewKpis}
                filteredOverviewSteps={filteredOverviewSteps}
                selectedOverviewStep={selectedOverviewStep}
                selectedOverviewStepId={selectedOverviewStepId}
                setSelectedOverviewStepId={setSelectedOverviewStepId}
                overviewShowRaw={overviewShowRaw}
                setOverviewShowRaw={setOverviewShowRaw}
                overviewHoverStepId={overviewHoverStepId}
                setOverviewHoverStepId={setOverviewHoverStepId}
              />
            </TabsContent>

            <TabsContent value="debug" className="mt-0">
              <DebugPanel
                tracesCollapsed={tracesCollapsed}
                setTracesCollapsed={setTracesCollapsed}
                detailCollapsed={detailCollapsed}
                setDetailCollapsed={setDetailCollapsed}
                filteredTraces={filteredTraces}
                tracesByAgent={tracesByAgent}
                loading={loading}
                traceSearch={traceSearch}
                setTraceSearch={setTraceSearch}
                selectedTraceId={selectedTraceId}
                setSelectedTraceId={setSelectedTraceId}
                selectedTrace={selectedTrace}
                setError={setError}
                exportTrace={exportTrace}
                spanSearch={spanSearch}
                setSpanSearch={setSpanSearch}
                filteredSpans={filteredSpans}
                spans={spans}
                selectedSpanId={selectedSpanId}
                setSelectedSpanId={setSelectedSpanId}
                selectedSpan={selectedSpan}
                selectedSpanEvents={selectedSpanEvents}
                selectedSpanContextRows={selectedSpanContextRows}
                traceCostStats={traceCostStats}
                suspiciousLoopSpanIds={suspiciousLoopSpanIds}
                parseJsonObject={parseJsonObject}
                detectSpanType={detectSpanType}
                timelineMeta={timelineMeta}
                ticks={ticks}
                timelineCanvasWidth={timelineCanvasWidth}
                timelineRowHeight={timelineRowHeight}
                timelineHeaderHeight={timelineHeaderHeight}
                nameColumnWidth={nameColumnWidth}
                formatOffsetMs={formatOffsetMs}
                formatDurationNs={formatDurationNs}
                toNumber={toNumber}
                formatTick={formatTick}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </TooltipProvider>
  );
}
