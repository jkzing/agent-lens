import type { DatabaseSync } from 'node:sqlite';
import { parseJson, toNumber } from '../lib/json.js';
import { extractSessionFields } from '../lib/session-extract.js';
import {
  countSessionTimeline,
  countSessionsOverview,
  countUnmappedSpans,
  listSessionTimeline,
  listSessionsOverview,
  type SessionOverviewQuery,
  type SessionTimelineQuery
} from '../repositories/sessionsRepo.js';

export function getSessionsOverview(db: DatabaseSync, query: SessionOverviewQuery) {
  const rows = listSessionsOverview(db, query) as Array<any>;
  const total = countSessionsOverview(db, query).total;
  const unmappedSpanCount = countUnmappedSpans(db, query).total;

  const items = rows.map((row) => ({
    session_key: row.session_key,
    first_seen_unix_nano: toNumber(row.first_seen_unix_nano),
    last_seen_unix_nano: toNumber(row.last_seen_unix_nano),
    span_count: toNumber(row.span_count),
    trace_count: toNumber(row.trace_count),
    event_types: parseEventTypes(row.event_types),
    channel: typeof row.channel === 'string' && row.channel.trim() ? row.channel.trim() : null
  }));

  return {
    items,
    total,
    unmappedSpanCount
  };
}

export function getSessionTimeline(db: DatabaseSync, query: SessionTimelineQuery) {
  const rows = listSessionTimeline(db, query) as Array<any>;
  const total = countSessionTimeline(db, query).total;

  const items = rows.map((row) => {
    const fields = extractSessionFields(row.attributes, row.resource_attributes);
    const resourceAttributes = parseJson(row.resource_attributes);
    const serviceName =
      typeof resourceAttributes['service.name'] === 'string' && resourceAttributes['service.name'].trim()
        ? resourceAttributes['service.name'].trim()
        : 'unknown';

    return {
      trace_id: row.trace_id,
      span_id: row.span_id,
      name: row.name,
      start_time_unix_nano: toNumber(row.start_time_unix_nano),
      end_time_unix_nano: toNumber(row.end_time_unix_nano),
      duration_ns: toNumber(row.duration_ns),
      service_name: serviceName,
      channel: fields.channel,
      state: fields.state,
      outcome: fields.outcome,
      attributes: row.attributes,
      resource_attributes: row.resource_attributes
    };
  });

  return {
    items,
    total
  };
}

function parseEventTypes(input: unknown): string[] {
  if (typeof input !== 'string' || !input.trim()) return [];
  const uniq = new Set(
    input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
}
