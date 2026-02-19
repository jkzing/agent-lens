import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { TraceSummary } from '@/hooks/useTraceData';

type TraceListPanelProps = {
  filteredTraces: TraceSummary[];
  tracesByAgent: Record<string, TraceSummary[]>;
  loading: boolean;
  traceSearch: string;
  setTraceSearch: (value: string) => void;
  selectedTraceId: string | null;
  setSelectedTraceId: (traceId: string) => void;
  formatDurationNs: (durationNs: number | null) => string;
  toNumber: (value: unknown) => number;
};

export function TraceListPanel({
  filteredTraces,
  tracesByAgent,
  loading,
  traceSearch,
  setTraceSearch,
  selectedTraceId,
  setSelectedTraceId,
  formatDurationNs,
  toNumber,
}: TraceListPanelProps) {
  return (
    <aside className="rounded-xl border border-border bg-card p-4" data-testid="trace-list-panel">
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
  );
}
