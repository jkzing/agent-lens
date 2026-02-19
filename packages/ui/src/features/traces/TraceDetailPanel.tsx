import { Badge } from '@/components/ui/badge';
import type { SpanRow } from '@/hooks/useTraceData';

type SpanKindType = 'llm' | 'tool' | 'internal';

type SpanEvent = {
  name: string;
  timeUnixNano: number | null;
  attributes: Record<string, unknown>;
};

type SpanContextRow = {
  label: string;
  value: string;
};

type TraceDetailPanelProps = {
  selectedSpan: SpanRow | null;
  selectedSpanEvents: SpanEvent[];
  selectedSpanContextRows: SpanContextRow[];
  parseJsonObject: (input: string | null) => Record<string, any>;
  detectSpanType: (span: SpanRow, attrs: Record<string, any>) => SpanKindType;
  formatDurationNs: (durationNs: number | null) => string;
  formatOffsetMs: (offsetNs: number) => string;
};

function eventVariant(name: string): 'default' | 'outline' {
  if (name === 'gen_ai.content.prompt' || name === 'gen_ai.content.completion') return 'default';
  return 'outline';
}

export function TraceDetailPanel({
  selectedSpan,
  selectedSpanEvents,
  selectedSpanContextRows,
  parseJsonObject,
  detectSpanType,
  formatDurationNs,
  formatOffsetMs,
}: TraceDetailPanelProps) {
  return (
    <aside className="rounded-xl border border-border bg-card p-4" data-testid="trace-detail-panel">
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
  );
}
