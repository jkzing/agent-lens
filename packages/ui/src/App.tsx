import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DebugPanel } from '@/features/debug/DebugPanel';
import { exportTrace, formatOffsetMs, formatTick } from '@/features/debug/utils';
import { OverviewPanel } from '@/features/overview/OverviewPanel';
import { formatDurationNs } from '@/features/overview/utils';
import { pickSelectedOverviewStep, useOverviewData } from '@/features/overview/useOverviewData';
import { SessionTimelinePanel } from '@/features/sessions/SessionTimelinePanel';
import { resolveTraceBridge } from '@/features/sessions/traceBridge';
import { detectSpanType, parseJsonObject, toNumber, useDebugViewState } from '@/hooks/useDebugViewState';
import { useSessionTimelineData } from '@/hooks/useSessionTimelineData';
import { useTraceData } from '@/hooks/useTraceData';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'debug' | 'session-timeline'>('overview');
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

  const {
    query: sessionQuery,
    setQuery: setSessionQuery,
    eventTypeFilter: sessionEventTypeFilter,
    setEventTypeFilter: setSessionEventTypeFilter,
    eventTypeOptions: sessionEventTypeOptions,
    overviewItems: sessionOverviewItems,
    overviewLoading: sessionOverviewLoading,
    overviewError: sessionOverviewError,
    selectedSessionKey,
    setSelectedSessionKey,
    timelineItems: sessionTimelineItems,
    timelineLoading: sessionTimelineLoading,
    timelineError: sessionTimelineError
  } = useSessionTimelineData();

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const trace of traces) {
      (trace.service_names || []).forEach((name) => set.add(name));
      if (trace.primary_service_name) set.add(trace.primary_service_name);
    }
    return Array.from(set).sort();
  }, [traces]);

  const traceIdSet = useMemo(() => new Set(traces.map((trace) => trace.trace_id)), [traces]);

  const {
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
    nameColumnWidth
  } = useDebugViewState({
    traces,
    spans,
    range,
    agentFilter,
    selectedTraceId,
    setSelectedTraceId,
    selectedSpanId,
    setSelectedSpanId
  });

  const { effectiveOverviewMode, filteredOverviewSteps, overviewKpis } = useOverviewData({
    spans,
    overviewActorFilter,
    overviewTimeFilter,
    overviewDataMode
  });

  const selectedOverviewStep = pickSelectedOverviewStep(filteredOverviewSteps, selectedOverviewStepId);

  useEffect(() => {
    if (filteredOverviewSteps.length === 0) {
      setSelectedOverviewStepId(null);
      return;
    }
    if (!selectedOverviewStepId || !filteredOverviewSteps.some((step) => step.id === selectedOverviewStepId)) {
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

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'overview' | 'debug' | 'session-timeline')} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
              <TabsTrigger value="session-timeline">Session Timeline</TabsTrigger>
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
                traceEventTypeFilter={traceEventTypeFilter}
                setTraceEventTypeFilter={setTraceEventTypeFilter}
                traceEventTypeOptions={traceEventTypeOptions}
                traceEventTypeCoverage={traceEventTypeCoverage}
                selectedTraceId={selectedTraceId}
                setSelectedTraceId={setSelectedTraceId}
                selectedTrace={selectedTrace}
                setError={setError}
                exportTrace={exportTrace}
                spanSearch={spanSearch}
                setSpanSearch={setSpanSearch}
                spanEventTypeFilter={spanEventTypeFilter}
                setSpanEventTypeFilter={setSpanEventTypeFilter}
                spanEventTypeOptions={spanEventTypeOptions}
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

            <TabsContent value="session-timeline" className="mt-0">
              <SessionTimelinePanel
                query={sessionQuery}
                setQuery={setSessionQuery}
                eventTypeFilter={sessionEventTypeFilter}
                setEventTypeFilter={setSessionEventTypeFilter}
                eventTypeOptions={sessionEventTypeOptions}
                overviewItems={sessionOverviewItems}
                overviewLoading={sessionOverviewLoading}
                overviewError={sessionOverviewError}
                selectedSessionKey={selectedSessionKey}
                setSelectedSessionKey={setSelectedSessionKey}
                timelineItems={sessionTimelineItems}
                timelineLoading={sessionTimelineLoading}
                timelineError={sessionTimelineError}
                onOpenTrace={(traceId) => {
                  setActiveTab('debug');
                  const resolution = resolveTraceBridge(traceId, traceIdSet);
                  if (!resolution.ok) {
                    setError(resolution.message);
                    return;
                  }
                  setError(null);
                  setSelectedTraceId(resolution.traceId);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </TooltipProvider>
  );
}
