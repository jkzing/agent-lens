import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';

export type EventTypeCoverageRow = {
  eventType: string;
  count: number;
};

export type EventTypeCoverage = {
  rows: EventTypeCoverageRow[];
  uniqueEventTypes: number;
};

export function normalizeEventType(value: string | null | undefined): string {
  const normalized = (value ?? '').trim();
  return normalized || 'unknown';
}

export function buildEventTypeCoverage(traces: TraceSummary[]): EventTypeCoverage {
  const byType = new Map<string, number>();

  for (const trace of traces) {
    const eventType = normalizeEventType(trace.root_span_name);
    byType.set(eventType, (byType.get(eventType) ?? 0) + 1);
  }

  const rows = Array.from(byType.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));

  return {
    rows,
    uniqueEventTypes: rows.length,
  };
}

export function buildEventTypeOptions(traces: TraceSummary[]): string[] {
  return buildEventTypeCoverage(traces).rows.map((row) => row.eventType);
}

export function filterTracesByEventType(traces: TraceSummary[], eventTypeFilter: string): TraceSummary[] {
  if (eventTypeFilter === 'all') return traces;
  return traces.filter((trace) => normalizeEventType(trace.root_span_name) === eventTypeFilter);
}

function buildSearchVisibleSpanIds(spans: SpanRow[], query: string): Set<number> {
  if (!query) {
    return new Set(spans.map((span) => span.id));
  }

  const bySpanId = new Map<string, SpanRow>();
  for (const span of spans) {
    if (span.span_id) bySpanId.set(span.span_id, span);
  }

  const visibleIds = new Set<number>();
  for (const span of spans) {
    const spanName = (span.name || '').toLowerCase();
    if (!spanName.includes(query)) continue;

    let cursor: SpanRow | null = span;
    while (cursor) {
      visibleIds.add(cursor.id);
      if (!cursor.parent_span_id) break;
      cursor = bySpanId.get(cursor.parent_span_id) || null;
    }
  }

  return visibleIds;
}

export function filterSpansForTimeline(spans: SpanRow[], spanSearch: string, spanEventTypeFilter: string): SpanRow[] {
  const query = spanSearch.trim().toLowerCase();
  const visibleBySearchIds = buildSearchVisibleSpanIds(spans, query);

  return spans.filter((span) => {
    if (!visibleBySearchIds.has(span.id)) return false;
    if (spanEventTypeFilter === 'all') return true;
    return normalizeEventType(span.name) === spanEventTypeFilter;
  });
}

export function buildSpanEventTypeOptions(spans: SpanRow[]): string[] {
  const byType = new Map<string, number>();
  for (const span of spans) {
    const eventType = normalizeEventType(span.name);
    byType.set(eventType, (byType.get(eventType) ?? 0) + 1);
  }

  return Array.from(byType.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([eventType]) => eventType);
}
