import type { DatabaseSync } from 'node:sqlite';

export type SessionOverviewQuery = {
  limit: number;
  offset: number;
  q?: string;
  channel?: string;
  eventType?: string;
  fromUnixNano?: string;
  toUnixNano?: string;
};

export type SessionTimelineQuery = {
  sessionKey: string;
  limit: number;
  offset: number;
  eventType?: string;
};

function sessionExpr(alias = 's') {
  return `COALESCE(
    json_extract(${alias}.attributes, '$."openclaw.sessionKey"'),
    json_extract(${alias}.attributes, '$."openclaw.sessionId"'),
    json_extract(${alias}.resource_attributes, '$."openclaw.sessionKey"'),
    json_extract(${alias}.resource_attributes, '$."openclaw.sessionId"')
  )`;
}

function channelExpr(alias = 's') {
  return `COALESCE(
    json_extract(${alias}.attributes, '$."openclaw.channel"'),
    json_extract(${alias}.attributes, '$.channel'),
    json_extract(${alias}.resource_attributes, '$."openclaw.channel"'),
    json_extract(${alias}.resource_attributes, '$.channel')
  )`;
}

function whereWithFilters(query: SessionOverviewQuery): { where: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.q && query.q.trim()) {
    clauses.push(`${sessionExpr()} LIKE ?`);
    params.push(`%${query.q.trim()}%`);
  }
  if (query.channel && query.channel.trim()) {
    clauses.push(`${channelExpr()} = ?`);
    params.push(query.channel.trim());
  }
  if (query.eventType && query.eventType.trim()) {
    clauses.push('s.name = ?');
    params.push(query.eventType.trim());
  }
  if (query.fromUnixNano) {
    clauses.push('CAST(s.start_time_unix_nano AS INTEGER) >= CAST(? AS INTEGER)');
    params.push(query.fromUnixNano);
  }
  if (query.toUnixNano) {
    clauses.push('CAST(s.start_time_unix_nano AS INTEGER) <= CAST(? AS INTEGER)');
    params.push(query.toUnixNano);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export function listSessionsOverview(db: DatabaseSync, query: SessionOverviewQuery) {
  const { where, params } = whereWithFilters(query);
  const sql = `
    WITH filtered AS (
      SELECT
        s.id,
        s.trace_id,
        s.name,
        s.start_time_unix_nano,
        s.end_time_unix_nano,
        ${sessionExpr()} AS session_key,
        ${channelExpr()} AS channel
      FROM spans s
      ${where}
    )
    SELECT
      session_key,
      MIN(CAST(start_time_unix_nano AS INTEGER)) AS first_seen_unix_nano,
      MAX(CAST(end_time_unix_nano AS INTEGER)) AS last_seen_unix_nano,
      COUNT(*) AS span_count,
      COUNT(DISTINCT trace_id) AS trace_count,
      GROUP_CONCAT(DISTINCT name) AS event_types,
      MIN(channel) AS channel
    FROM filtered
    WHERE session_key IS NOT NULL AND session_key != ''
    GROUP BY session_key
    ORDER BY last_seen_unix_nano DESC, session_key ASC
    LIMIT ? OFFSET ?`;

  return db.prepare(sql).all(...params, query.limit, query.offset);
}

export function countSessionsOverview(db: DatabaseSync, query: SessionOverviewQuery) {
  const { where, params } = whereWithFilters(query);
  const sql = `
    WITH filtered AS (
      SELECT ${sessionExpr()} AS session_key
      FROM spans s
      ${where}
    )
    SELECT COUNT(*) AS total
    FROM (
      SELECT session_key
      FROM filtered
      WHERE session_key IS NOT NULL AND session_key != ''
      GROUP BY session_key
    ) t`;

  return db.prepare(sql).get(...params) as { total: number };
}

export function countUnmappedSpans(db: DatabaseSync, query: SessionOverviewQuery) {
  const { where, params } = whereWithFilters(query);
  const sql = `
    WITH filtered AS (
      SELECT ${sessionExpr()} AS session_key
      FROM spans s
      ${where}
    )
    SELECT COUNT(*) AS total
    FROM filtered
    WHERE session_key IS NULL OR session_key = ''`;

  return db.prepare(sql).get(...params) as { total: number };
}

export function listSessionTimeline(db: DatabaseSync, query: SessionTimelineQuery) {
  const params: Array<string | number> = [query.sessionKey];
  let eventTypeWhere = '';

  if (query.eventType && query.eventType.trim()) {
    eventTypeWhere = 'AND s.name = ?';
    params.push(query.eventType.trim());
  }

  const sql = `
    SELECT
      s.id,
      s.trace_id,
      s.span_id,
      s.name,
      s.start_time_unix_nano,
      s.end_time_unix_nano,
      s.duration_ns,
      s.attributes,
      s.resource_attributes
    FROM spans s
    WHERE ${sessionExpr()} = ?
      ${eventTypeWhere}
    ORDER BY CAST(s.start_time_unix_nano AS INTEGER) ASC, s.id ASC
    LIMIT ? OFFSET ?`;

  return db.prepare(sql).all(...params, query.limit, query.offset);
}

export function countSessionTimeline(db: DatabaseSync, query: SessionTimelineQuery) {
  const params: Array<string | number> = [query.sessionKey];
  let eventTypeWhere = '';

  if (query.eventType && query.eventType.trim()) {
    eventTypeWhere = 'AND s.name = ?';
    params.push(query.eventType.trim());
  }

  const sql = `
    SELECT COUNT(*) AS total
    FROM spans s
    WHERE ${sessionExpr()} = ?
      ${eventTypeWhere}`;

  return db.prepare(sql).get(...params) as { total: number };
}
