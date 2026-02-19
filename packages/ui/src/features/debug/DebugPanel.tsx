import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';
import { TraceDetailPanel } from '@/features/traces/TraceDetailPanel';
import { TraceListPanel } from '@/features/traces/TraceListPanel';
import { TraceTimelinePanel } from '@/features/waterfall/TraceTimelinePanel';
import { cn } from '@/lib/utils';

type SpanKindType = 'llm' | 'tool' | 'internal';

type ModelCostStat = {
  key: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

type DebugPanelProps = {
  tracesCollapsed: boolean;
  setTracesCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  detailCollapsed: boolean;
  setDetailCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  filteredTraces: TraceSummary[];
  tracesByAgent: Record<string, TraceSummary[]>;
  loading: boolean;
  traceSearch: string;
  setTraceSearch: (value: string) => void;
  selectedTraceId: string | null;
  setSelectedTraceId: (traceId: string) => void;
  selectedTrace: TraceSummary | null;
  setError: (value: string) => void;
  exportTrace: (traceId: string, format: 'json' | 'csv') => Promise<void>;
  spanSearch: string;
  setSpanSearch: (value: string) => void;
  filteredSpans: SpanRow[];
  spans: SpanRow[];
  selectedSpanId: number | null;
  setSelectedSpanId: (id: number | null) => void;
  selectedSpan: SpanRow | null;
  selectedSpanEvents: Array<{ name: string; timeUnixNano: number | null; attributes: Record<string, unknown> }>;
  selectedSpanContextRows: Array<{ label: string; value: string }>;
  traceCostStats: { input: number; output: number; cost: number; modelRows: ModelCostStat[] };
  suspiciousLoopSpanIds: Set<number>;
  parseJsonObject: (input: string | null) => Record<string, any>;
  detectSpanType: (span: SpanRow, attrs: Record<string, any>) => SpanKindType;
  timelineMeta: { minStart: number; maxEnd: number; total: number };
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

export function DebugPanel({
  tracesCollapsed,
  setTracesCollapsed,
  detailCollapsed,
  setDetailCollapsed,
  filteredTraces,
  tracesByAgent,
  loading,
  traceSearch,
  setTraceSearch,
  selectedTraceId,
  setSelectedTraceId,
  selectedTrace,
  setError,
  exportTrace,
  spanSearch,
  setSpanSearch,
  filteredSpans,
  spans,
  selectedSpanId,
  setSelectedSpanId,
  selectedSpan,
  selectedSpanEvents,
  selectedSpanContextRows,
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
}: DebugPanelProps) {
  return (
    <section
      className={cn(
        'grid grid-cols-1 gap-4',
        tracesCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[320px_minmax(0,1fr)]'
      )}
      data-testid="debug-panel"
    >
      {!tracesCollapsed ? (
        <TraceListPanel
          filteredTraces={filteredTraces}
          tracesByAgent={tracesByAgent}
          loading={loading}
          traceSearch={traceSearch}
          setTraceSearch={setTraceSearch}
          selectedTraceId={selectedTraceId}
          setSelectedTraceId={setSelectedTraceId}
          formatDurationNs={formatDurationNs}
          toNumber={toNumber}
        />
      ) : null}

      <section
        className={cn(
          'min-w-0 grid grid-cols-1 gap-4',
          detailCollapsed ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_360px]'
        )}
      >
        <TraceTimelinePanel
          tracesCollapsed={tracesCollapsed}
          setTracesCollapsed={setTracesCollapsed}
          detailCollapsed={detailCollapsed}
          setDetailCollapsed={setDetailCollapsed}
          selectedTrace={selectedTrace}
          setError={setError}
          exportTrace={exportTrace}
          spanSearch={spanSearch}
          setSpanSearch={setSpanSearch}
          filteredSpans={filteredSpans}
          spans={spans}
          selectedSpanId={selectedSpanId}
          setSelectedSpanId={setSelectedSpanId}
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

        {!detailCollapsed ? (
          <TraceDetailPanel
            selectedSpan={selectedSpan}
            selectedSpanEvents={selectedSpanEvents}
            selectedSpanContextRows={selectedSpanContextRows}
            parseJsonObject={parseJsonObject}
            detectSpanType={detectSpanType}
            formatDurationNs={formatDurationNs}
            formatOffsetMs={formatOffsetMs}
          />
        ) : null}
      </section>
    </section>
  );
}
