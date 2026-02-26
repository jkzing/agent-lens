import type { SpanRow, TraceSummary } from '@/hooks/useTraceData';

export type DebugSignalsPrefill = {
  service?: string;
  sessionKey?: string;
  from?: string;
  to?: string;
};

const SESSION_KEY_CANDIDATES = ['session.key', 'session_id', 'session.id', 'sessionKey', 'agent.session_key'];

function parseAttrs(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function pickString(attrs: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function nanosToIso(value: string | number | null | undefined) {
  if (value == null) return undefined;
  const raw = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const ms = Math.floor(raw / 1_000_000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function buildDebugSignalsPrefill(selectedTrace: TraceSummary | null, selectedSpan: SpanRow | null): DebugSignalsPrefill {
  const attrs = parseAttrs(selectedSpan?.attributes ?? null);
  const resourceAttrs = parseAttrs(selectedSpan?.resource_attributes ?? null);

  const service =
    pickString(attrs, ['service.name']) ||
    pickString(resourceAttrs, ['service.name']) ||
    selectedTrace?.primary_service_name ||
    selectedTrace?.service_names?.[0] ||
    undefined;

  const sessionKey = pickString(attrs, SESSION_KEY_CANDIDATES) || pickString(resourceAttrs, SESSION_KEY_CANDIDATES) || undefined;

  const from = nanosToIso(selectedSpan?.start_time_unix_nano) || selectedTrace?.first_received_at || undefined;
  const to = nanosToIso(selectedSpan?.end_time_unix_nano) || selectedTrace?.last_received_at || undefined;

  return {
    service,
    sessionKey,
    from,
    to
  };
}
