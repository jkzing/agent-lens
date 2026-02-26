import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from '@rstest/core';
import { SessionTimelinePanel } from './SessionTimelinePanel';

describe('SessionTimelinePanel', () => {
  afterEach(() => cleanup());

  it('renders and allows selecting session + open trace', () => {
    const selected: string[] = [];
    const opened: string[] = [];

    render(
      <SessionTimelinePanel
        query=""
        setQuery={() => {}}
        eventTypeFilter="all"
        setEventTypeFilter={() => {}}
        eventTypeOptions={['message.sent']}
        overviewItems={[
          {
            session_key: 'sess-1',
            first_seen_unix_nano: 1,
            last_seen_unix_nano: 2,
            span_count: 2,
            trace_count: 1,
            event_types: ['message.sent'],
            channel: 'telegram'
          }
        ]}
        overviewLoading={false}
        overviewError={null}
        selectedSessionKey={null}
        setSelectedSessionKey={(value) => selected.push(value)}
        timelineItems={[
          {
            trace_id: 'trace-1',
            span_id: 'span-1',
            name: 'event-1',
            start_time_unix_nano: 1_700_000_000_000_000_000,
            end_time_unix_nano: null,
            duration_ns: 100,
            service_name: 'nyx',
            channel: 'telegram',
            state: 'done',
            outcome: 'ok',
            attributes: null,
            resource_attributes: null
          }
        ]}
        timelineLoading={false}
        timelineError={null}
        onOpenTrace={(traceId) => opened.push(traceId)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /sess-1/i }));
    fireEvent.click(screen.getByRole('button', { name: /open trace/i }));

    expect(selected).toEqual(['sess-1']);
    expect(opened).toEqual(['trace-1']);
  });

  it('shows loading and empty states', () => {
    render(
      <SessionTimelinePanel
        query=""
        setQuery={() => {}}
        eventTypeFilter="all"
        setEventTypeFilter={() => {}}
        eventTypeOptions={[]}
        overviewItems={[]}
        overviewLoading={true}
        overviewError={null}
        selectedSessionKey={null}
        setSelectedSessionKey={() => {}}
        timelineItems={[]}
        timelineLoading={false}
        timelineError={null}
      />
    );

    expect(screen.getByText('Loading sessions…')).toBeTruthy();
    expect(screen.getByText('Select a session to view timeline events.')).toBeTruthy();
  });
});
