import type { DatabaseSync } from 'node:sqlite';

export type SignalRecordFilters = {
  from?: string;
  to?: string;
  service?: string;
  sessionKey?: string;
  parseStatus?: string;
  severity?: string;
  metricName?: string;
};

type SqlWhere = { clauses: string[]; params: any[] };

function buildBaseWhere(filters: SignalRecordFilters): SqlWhere {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters.from) {
    clauses.push('received_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push('received_at <= ?');
    params.push(filters.to);
  }
  if (filters.service) {
    clauses.push('service_name = ?');
    params.push(filters.service);
  }
  if (filters.sessionKey) {
    clauses.push('session_key = ?');
    params.push(filters.sessionKey);
  }
  if (filters.parseStatus) {
    clauses.push('parse_status = ?');
    params.push(filters.parseStatus);
  }

  return { clauses, params };
}

export function listMetricPayloadRecords(db: DatabaseSync, limit: number, offset: number, filters: SignalRecordFilters) {
  const where = buildBaseWhere(filters);

  if (filters.metricName) {
    where.clauses.push('metric_names LIKE ?');
    where.params.push(`%${filters.metricName}%`);
  }

  const whereSql = where.clauses.length > 0 ? `WHERE ${where.clauses.join(' AND ')}` : '';

  const items = db
    .prepare(
      `SELECT id, received_at, content_type, parse_status, parse_error, item_count, service_name, session_key, metric_names, payload
       FROM metric_payloads
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...where.params, limit, offset) as Array<{
    id: number;
    received_at: string;
    content_type: string;
    parse_status: string;
    parse_error: string | null;
    item_count: number | null;
    service_name: string | null;
    session_key: string | null;
    metric_names: string | null;
    payload: string | null;
  }>;

  const totalRow = db
    .prepare(`SELECT COUNT(*) as total FROM metric_payloads ${whereSql}`)
    .get(...where.params) as { total: number };

  return {
    items: items.map((row) => ({
      ...row,
      id: Number(row.id),
      item_count: row.item_count == null ? null : Number(row.item_count)
    })),
    total: Number(totalRow.total || 0)
  };
}

export function listLogPayloadRecords(db: DatabaseSync, limit: number, offset: number, filters: SignalRecordFilters) {
  const where = buildBaseWhere(filters);

  if (filters.severity) {
    const maybeSeverityNumber = Number(filters.severity);
    if (Number.isFinite(maybeSeverityNumber)) {
      where.clauses.push("(severity_number = ? OR LOWER(COALESCE(severity_text, '')) = LOWER(?))");
      where.params.push(maybeSeverityNumber, filters.severity);
    } else {
      where.clauses.push("LOWER(COALESCE(severity_text, '')) = LOWER(?)");
      where.params.push(filters.severity);
    }
  }

  const whereSql = where.clauses.length > 0 ? `WHERE ${where.clauses.join(' AND ')}` : '';

  const items = db
    .prepare(
      `SELECT id, received_at, content_type, parse_status, parse_error, item_count, service_name, session_key, severity_text, severity_number, payload
       FROM log_payloads
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...where.params, limit, offset) as Array<{
    id: number;
    received_at: string;
    content_type: string;
    parse_status: string;
    parse_error: string | null;
    item_count: number | null;
    service_name: string | null;
    session_key: string | null;
    severity_text: string | null;
    severity_number: number | null;
    payload: string | null;
  }>;

  const totalRow = db
    .prepare(`SELECT COUNT(*) as total FROM log_payloads ${whereSql}`)
    .get(...where.params) as { total: number };

  return {
    items: items.map((row) => ({
      ...row,
      id: Number(row.id),
      item_count: row.item_count == null ? null : Number(row.item_count),
      severity_number: row.severity_number == null ? null : Number(row.severity_number)
    })),
    total: Number(totalRow.total || 0)
  };
}
