import { memo, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { SessionOverviewItem, SessionTimelineItem } from '@/hooks/useSessionTimelineData';

type SessionTimelinePanelProps = {
  query: string;
  setQuery: (value: string) => void;
  eventTypeFilter: string;
  setEventTypeFilter: (value: string) => void;
  eventTypeOptions: string[];
  overviewItems: SessionOverviewItem[];
  overviewLoading: boolean;
  overviewError: string | null;
  selectedSessionKey: string | null;
  setSelectedSessionKey: (value: string) => void;
  timelineItems: SessionTimelineItem[];
  timelineLoading: boolean;
  timelineError: string | null;
  onOpenTrace?: (traceId: string) => void;
  onOpenSignals?: (options: { sessionKey?: string | null; service?: string | null }) => void;
};

export function SessionTimelinePanel({
  query,
  setQuery,
  eventTypeFilter,
  setEventTypeFilter,
  eventTypeOptions,
  overviewItems,
  overviewLoading,
  overviewError,
  selectedSessionKey,
  setSelectedSessionKey,
  timelineItems,
  timelineLoading,
  timelineError,
  onOpenTrace,
  onOpenSignals
}: SessionTimelinePanelProps) {
  const [selectedEventIndex, setSelectedEventIndex] = useState<number>(0);

  useEffect(() => {
    setSelectedEventIndex(0);
  }, [selectedSessionKey]);

  useEffect(() => {
    if (timelineItems.length === 0) {
      setSelectedEventIndex(0);
      return;
    }
    if (selectedEventIndex >= timelineItems.length) {
      setSelectedEventIndex(0);
    }
  }, [selectedEventIndex, timelineItems]);

  const selectedEvent = timelineItems[selectedEventIndex] ?? null;

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]" data-testid="session-timeline-panel">
      <aside className="rounded-md border border-border bg-card p-3">
        <h2 className="text-sm font-medium">Sessions</h2>
        <div className="mt-3 space-y-2">
          <Input
            placeholder="Search sessions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Session search"
          />
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            aria-label="Session event type filter"
          >
            <option value="all">All event types</option>
            {eventTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 max-h-[620px] overflow-auto">
          {overviewLoading ? <p className="text-sm text-muted-foreground">Loading sessions…</p> : null}
          {!overviewLoading && overviewError ? <p className="text-sm text-destructive">{overviewError}</p> : null}
          {!overviewLoading && !overviewError && overviewItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions found.</p>
          ) : null}
          {!overviewLoading && !overviewError && overviewItems.length > 0 ? (
            <ul className="space-y-1">
              {overviewItems.map((item) => {
                const active = selectedSessionKey === item.session_key;
                return (
                  <li key={item.session_key}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-2 py-2 text-left text-sm ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                      onClick={() => setSelectedSessionKey(item.session_key)}
                    >
                      <div className="truncate font-medium">{item.session_key}</div>
                      <div className="text-xs text-muted-foreground">
                        traces {item.trace_count} · spans {item.span_count}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </aside>

      <section className="rounded-md border border-border bg-card p-3">
        <h2 className="text-sm font-medium">Session Events</h2>
        {timelineLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading timeline…</p> : null}
        {!timelineLoading && timelineError ? <p className="mt-3 text-sm text-destructive">{timelineError}</p> : null}
        {!timelineLoading && !timelineError && !selectedSessionKey ? (
          <p className="mt-3 text-sm text-muted-foreground">Select a session to view timeline events.</p>
        ) : null}
        {!timelineLoading && !timelineError && selectedSessionKey && timelineItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No events for this session.</p>
        ) : null}

        {!timelineLoading && !timelineError && timelineItems.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="max-h-[640px] overflow-auto pr-1">
              <ul className="space-y-2">
                {timelineItems.map((item, index) => (
                  <TimelineEventRow
                    key={`${item.span_id ?? 'span'}-${index}`}
                    item={item}
                    isSelected={selectedEventIndex === index}
                    onSelect={() => setSelectedEventIndex(index)}
                    onOpenTrace={onOpenTrace}
                    onOpenSignals={
                      onOpenSignals
                        ? (options) => onOpenSignals({ ...options, sessionKey: selectedSessionKey })
                        : undefined
                    }
                  />
                ))}
              </ul>
            </div>

            <EventDetailPanel item={selectedEvent} />
          </div>
        ) : null}
      </section>
    </section>
  );
}

type TimelineEventRowProps = {
  item: SessionTimelineItem;
  isSelected: boolean;
  onSelect: () => void;
  onOpenTrace?: (traceId: string) => void;
  onOpenSignals?: (options: { sessionKey?: string | null; service?: string | null }) => void;
};

const TimelineEventRow = memo(function TimelineEventRow({ item, isSelected, onSelect, onOpenTrace, onOpenSignals }: TimelineEventRowProps) {
  const traceAvailable = Boolean(item.trace_id && onOpenTrace);
  return (
    <li>
      <div
        className={`w-full rounded-md border px-3 py-2 text-left ${isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Select timeline event ${item.name ?? 'unknown'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{item.name || '-'}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.service_name || '-'} · {item.state || '-'} · {item.outcome || '-'}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">{formatUnixNano(item.start_time_unix_nano)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{formatDuration(item.duration_ns)}</div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{item.channel || 'unknown channel'}</span>
          {traceAvailable ? (
            <button
              type="button"
              className="text-primary underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenTrace?.(item.trace_id!);
              }}
            >
              Open Trace
            </button>
          ) : (
            <span className="text-muted-foreground">Trace unavailable</span>
          )}
          {onOpenSignals ? (
            <button
              type="button"
              className="text-primary underline"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSignals({ service: item.service_name });
              }}
            >
              Open Signals
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
});

type EventDetailPanelProps = {
  item: SessionTimelineItem | null;
};

function EventDetailPanel({ item }: EventDetailPanelProps) {
  if (!item) {
    return <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">Select an event to inspect details.</div>;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/10 p-3" data-testid="timeline-event-detail">
      <h3 className="text-sm font-medium">Event Detail</h3>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1 text-xs">
        <div className="text-muted-foreground">Name</div>
        <div>{item.name || '-'}</div>
        <div className="text-muted-foreground">Service</div>
        <div>{item.service_name || '-'}</div>
        <div className="text-muted-foreground">Start</div>
        <div>{formatUnixNano(item.start_time_unix_nano)}</div>
        <div className="text-muted-foreground">Duration</div>
        <div>{formatDuration(item.duration_ns)}</div>
        <div className="text-muted-foreground">Trace ID</div>
        <div className="break-all">{item.trace_id || '-'}</div>
      </div>

      <JsonSection title="Attributes" value={item.attributes} />
      <JsonSection title="Resource Attributes" value={item.resource_attributes} />
    </div>
  );
}

type JsonSectionProps = {
  title: string;
  value: string | null;
};

function JsonSection({ title, value }: JsonSectionProps) {
  const pretty = useMemo(() => formatJsonString(value), [value]);
  return (
    <details className="rounded-md border border-border bg-background/50 p-2" open>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{title}</summary>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all text-[11px]">{pretty}</pre>
    </details>
  );
}

function formatUnixNano(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-';
  return new Date(Math.floor(value / 1_000_000)).toLocaleString();
}

function formatDuration(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-';
  if (value < 1_000) return `${value} ns`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(2)} μs`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)} ms`;
  return `${(value / 1_000_000_000).toFixed(2)} s`;
}

function formatJsonString(value: string | null) {
  if (!value) return '—';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
