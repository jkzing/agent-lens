# Phase 4 PR2A: Metrics/Logs Query API (Backend First)

## Goal

Add a low-risk, additive backend slice for querying ingested OTLP metrics/log payload records with basic filters and pagination.

## Schema Additions (additive)

`metric_payloads` new columns:

- `service_name` (`TEXT`)
- `session_key` (`TEXT`)
- `metric_names` (`TEXT`, JSON-encoded string array)

`log_payloads` new columns:

- `service_name` (`TEXT`)
- `session_key` (`TEXT`)
- `severity_text` (`TEXT`)
- `severity_number` (`INTEGER`)

Indexes were added for these query fields where useful (`service_name`, `session_key`, and log severities).

## Ingest Derivation (new records)

On `POST /v1/metrics` and `POST /v1/logs`, successful payload rows now derive/store:

- `service_name` from resource attribute `service.name` (if present)
- `session_key` from `openclaw.sessionKey` / `openclaw.sessionId` (resource or item attributes)
- metrics: unique `metric_names` from payload metric names
- logs: highest observed `severity_number` and corresponding `severity_text` (if present)

Parse-error rows keep derived fields `NULL`.

## New Read Endpoints

### `GET /api/metrics/records`

Query params:

- `limit`, `offset`
- `from`, `to` (received_at ISO timestamp range)
- `service`
- `sessionKey`
- `parseStatus`
- `metricName` (substring match against `metric_names`)

### `GET /api/logs/records`

Query params:

- `limit`, `offset`
- `from`, `to` (received_at ISO timestamp range)
- `service`
- `sessionKey`
- `parseStatus`
- `severity` (matches `severity_text` case-insensitively, or exact numeric `severity_number`)

## Response Contract

Both endpoints return:

```json
{
  "ok": true,
  "items": [
    { "id": 123, "received_at": "...", "...": "..." }
  ],
  "pagination": {
    "offset": 0,
    "limit": 100,
    "total": 42
  }
}
```

This matches existing API response style and keeps current summary endpoints unchanged.

## Backfill Note

No backfill is executed in PR2A for historical metrics/log rows. Existing rows will have new fields as `NULL`. Backfill can be added later as a bounded opt-in task if needed.

## Rollback Safety

Changes are additive only (new nullable columns + indexes + read endpoints). Existing endpoints/contracts remain compatible.
