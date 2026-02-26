# Phase 3 PR1: Derived/queryable span columns

This change introduces additive derived columns on `spans` to reduce repeated JSON extraction in session/traces queries.

## Added columns (backward-compatible)

- `event_type`
- `session_key`
- `session_id`
- `channel`
- `state`
- `outcome`

## Ingestion behavior

Newly ingested rows now populate these columns during write:

- `event_type` from span `name`
- `session_key` / `session_id` / `channel` / `state` / `outcome` from attributes/resource attributes (same fallback order as existing extraction logic)

## Backfill strategy

A bounded bootstrap backfill is executed in `createApp`:

- Function: `backfillDerivedSpanColumns(db, limit)`
- Default limit: `1000` rows per startup
- Configurable via env: `AGENT_LENS_DERIVED_BACKFILL_LIMIT`
- `0` or negative disables bootstrap backfill

The backfill updates only rows where at least one derived column is `NULL`, in `id ASC` order. This keeps startup impact predictable while allowing eventual full backfill over multiple restarts.

## Query behavior

Session queries now prefer derived columns and fall back to JSON extraction only when derived value is missing:

- `COALESCE(session_key, json_extract(...))`
- `COALESCE(channel, json_extract(...))`
- `COALESCE(event_type, name)`

This preserves behavior during partial backfill.

## Indexes

Additive indexes for derived columns:

- `idx_spans_session_key_start`
- `idx_spans_channel`
- `idx_spans_event_type_start_time`

Existing expression indexes from PR4 are retained for compatibility during migration:

- `idx_spans_session_key_start_expr`
- `idx_spans_channel_expr`

## Expected performance impact

- Reduced JSON extraction CPU in session overview/timeline paths
- Better index utilization on session/event/channel filters once backfill progresses
- No API response shape changes
