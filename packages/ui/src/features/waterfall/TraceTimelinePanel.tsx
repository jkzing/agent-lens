import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';

type SpanKindType = 'llm' | 'tool' | 'internal';

type ModelCostStat = {
  key: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

type TimelineMeta = { minStart: number; maxEnd: number; total: number };

type TraceTimelinePanelProps = {
  tracesCollapsed: boolean;
  setTracesCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  detailCollapsed: boolean;
  setDetailCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  selectedTrace: TraceSummary | null;
  setError: (value: string) => void;
  exportTrace: (traceId: string, format: 'json' | 'csv') => Promise<void>;
  onOpenSignals?: () => void;
  spanSearch: string;
  setSpanSearch: (value: string) => void;
  spanEventTypeFilter: string;
  setSpanEventTypeFilter: (value: string) => void;
  spanEventTypeOptions: string[];
  filteredSpans: SpanRow[];
  spans: SpanRow[];
  selectedSpanId: number | null;
  setSelectedSpanId: (id: number | null) => void;
  traceCostStats: { input: number; output: number; cost: number; modelRows: ModelCostStat[] };
  suspiciousLoopSpanIds: Set<number>;
  parseJsonObject: (input: string | null) => Record<string, any>;
  detectSpanType: (span: SpanRow, attrs: Record<string, any>) => SpanKindType;
  timelineMeta: TimelineMeta;
  ticks: number[];
  timelineCanvasWidth: number;
  timelineRowHeight: number;
  timelineHeaderHeight: number;
  nameColumnWidth: number;
  formatOffsetMs: (offsetNs: number) => string;
  formatDurationNs: (durationNs: number | null) => string;
  toNumber: (value: unknown) => number;
  formatTick: (ns: number) => string;
};

function hasFollowingAtDepth(spans: SpanRow[], index: number, depth: number): boolean {
  for (let i = index + 1; i < spans.length; i += 1) {
    const nextDepth = spans[i].depth;
    if (nextDepth < depth) return false;
    if (nextDepth === depth) return true;
  }
  return false;
}

export function TraceTimelinePanel({
  tracesCollapsed,
  setTracesCollapsed,
  detailCollapsed,
  setDetailCollapsed,
  selectedTrace,
  setError,
  exportTrace,
  onOpenSignals,
  spanSearch,
  setSpanSearch,
  spanEventTypeFilter,
  setSpanEventTypeFilter,
  spanEventTypeOptions,
  filteredSpans,
  spans,
  selectedSpanId,
  setSelectedSpanId,
  traceCostStats,
  suspiciousLoopSpanIds,
  parseJsonObject,
  detectSpanType,
  timelineMeta,
  ticks,
  timelineCanvasWidth,
  timelineRowHeight,
  timelineHeaderHeight,
  nameColumnWidth,
  formatOffsetMs,
  formatDurationNs,
  toNumber,
  formatTick,
}: TraceTimelinePanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="trace-timeline-panel">
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
            {onOpenSignals ? (
              <Button size="sm" variant="secondary" onClick={onOpenSignals}>
                Open in Signals
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => exportTrace(selectedTrace.trace_id, 'json').catch((err) => setError(err.message || 'Export failed'))}>
              Export JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportTrace(selectedTrace.trace_id, 'csv').catch((err) => setError(err.message || 'Export failed'))}>
              Export CSV
            </Button>
          </div>
        ) : null}
      </div>

      {selectedTrace ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            value={spanSearch}
            onChange={(e) => setSpanSearch(e.target.value)}
            placeholder="Filter spans by name..."
            className="max-w-sm"
          />
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={spanEventTypeFilter}
            onChange={(e) => setSpanEventTypeFilter(e.target.value)}
            aria-label="Filter timeline by span event type"
          >
            <option value="all">All span types</option>
            {spanEventTypeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
          {(spanSearch.trim() || spanEventTypeFilter !== 'all') ? (
            <>
              <span className="text-xs text-muted-foreground">
                showing {filteredSpans.length}/{spans.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSpanSearch('');
                  setSpanEventTypeFilter('all');
                }}
              >
                Clear
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

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
            {filteredSpans.length === 0 ? (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="text-sm font-medium">No spans match this filter</div>
                <div className="text-xs text-muted-foreground">Try another keyword or clear the current span filter.</div>
                {spanSearch.trim() ? (
                  <Button size="sm" variant="secondary" onClick={() => setSpanSearch('')}>
                    Clear span filter
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex min-w-0">
                <div className="shrink-0 border-r border-border bg-background/40" style={{ width: `${nameColumnWidth}px` }}>
                  <div className="sticky top-0 z-20 flex items-center border-b border-border bg-background/80 px-3 text-xs font-medium text-muted-foreground backdrop-blur" style={{ height: `${timelineHeaderHeight}px` }}>
                    Span
                  </div>
                  {filteredSpans.map((span, index) => {
                    const attrs = parseJsonObject(span.attributes);
                    const type = detectSpanType(span, attrs);
                    const indent = span.depth * 12;
                    const spanName = span.name || 'unknown';
                    const matchesSpanSearch =
                      !!spanSearch.trim() && spanName.toLowerCase().includes(spanSearch.trim().toLowerCase());

                    return (
                      <button
                        key={span.id}
                        onClick={() => setSelectedSpanId(span.id)}
                        className={cn(
                          'relative block w-full border-b border-border/60 px-2 text-left transition last:border-b-0',
                          selectedSpanId === span.id ? 'bg-primary/12 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/50'
                        )}
                        style={{ height: `${timelineRowHeight}px` }}
                      >
                        {span.depth > 0 ? (
                          <div className="pointer-events-none absolute inset-0">
                            {Array.from({ length: span.depth }).map((_, levelIndex) => {
                              const level = levelIndex + 1;
                              const left = (level - 1) * 12 + 6;
                              const hasNext = hasFollowingAtDepth(filteredSpans, index, level);
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
                          <span className={cn('truncate text-sm', matchesSpanSearch && 'font-semibold text-primary')}>
                            {spanName}
                          </span>
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
                      {filteredSpans.map((span) => {
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
                        const offsetNs = Math.max(0, start - timelineMeta.minStart);
                        const inputTokens = toNumber(attrs['gen_ai.usage.input_tokens']);
                        const outputTokens = toNumber(attrs['gen_ai.usage.output_tokens']);
                        const spanStatus = span.status_code === 2 ? 'error' : span.end_time_unix_nano ? 'completed' : 'running';

                        return (
                          <button
                            key={span.id}
                            onClick={() => setSelectedSpanId(span.id)}
                            className={cn(
                              'relative block w-full border-b border-border/60 px-2 text-left transition last:border-b-0',
                              selectedSpanId === span.id ? 'bg-primary/12 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/50'
                            )}
                            style={{ height: `${timelineRowHeight}px` }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    'absolute top-1/2 h-4 -translate-y-1/2 rounded-sm',
                                    type === 'llm' ? 'bg-violet-500/80' : type === 'tool' ? 'bg-cyan-500/80' : 'bg-slate-500/80',
                                    selectedSpanId === span.id && 'ring-2 ring-primary/80 shadow-[0_0_0_1px_hsl(var(--background))]',
                                    suspiciousLoopSpanIds.has(span.id) && 'ring-1 ring-amber-400'
                                  )}
                                  style={isPointSpan ? { left: `${left}%`, width: '4px' } : { left: `${left}%`, width: `${width}%` }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1 text-xs">
                                  <div className="font-semibold text-sm">{span.name || 'unknown'}</div>
                                  <div>type: {type}</div>
                                  <div>status: {spanStatus}</div>
                                  <div>offset: {formatOffsetMs(offsetNs)}</div>
                                  <div>duration: {formatDurationNs(span.duration_ns)}</div>
                                  {(inputTokens > 0 || outputTokens > 0) ? (
                                    <div>tokens: in {inputTokens} / out {outputTokens}</div>
                                  ) : null}
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
