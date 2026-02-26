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
  onOpenTrace
}: SessionTimelinePanelProps) {
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
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[740px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Start</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Service</th>
                  <th className="px-2 py-1">State</th>
                  <th className="px-2 py-1">Outcome</th>
                  <th className="px-2 py-1">Trace</th>
                </tr>
              </thead>
              <tbody>
                {timelineItems.map((item, index) => (
                  <tr key={`${item.span_id ?? 'span'}-${index}`} className="border-t border-border">
                    <td className="px-2 py-1">{formatUnixNano(item.start_time_unix_nano)}</td>
                    <td className="px-2 py-1">{item.name || '-'}</td>
                    <td className="px-2 py-1">{item.service_name || '-'}</td>
                    <td className="px-2 py-1">{item.state || '-'}</td>
                    <td className="px-2 py-1">{item.outcome || '-'}</td>
                    <td className="px-2 py-1">
                      {item.trace_id && onOpenTrace ? (
                        <button type="button" className="text-xs text-primary underline" onClick={() => onOpenTrace(item.trace_id!)}>
                          Open Trace
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function formatUnixNano(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-';
  return new Date(Math.floor(value / 1_000_000)).toLocaleString();
}
