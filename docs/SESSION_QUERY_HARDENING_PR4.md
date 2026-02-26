# PR4 Session Query/Index Hardening Benchmark Notes

## Scope

Phase 2 optional PR4 goals:

1. Profile session APIs on realistic volume.
2. Apply low-risk index hardening only when justified by measurements.
3. Capture reproducible benchmark notes for Phase 3 decisions.

## Dataset + Harness

- Script: `packages/server/scripts/benchmark-sessions.ts`
- Run command: `pnpm -C packages/server bench:sessions`
- Data generation is deterministic (fixed patterns and IDs).
- Dataset shape used in this doc:
  - sessions: `3000`
  - spans/session: `25`
  - orphan spans (no session key): `5000`
  - total spans: `80,000`
- Measurement method:
  - local in-process endpoint calls via `app.request()`
  - warmup: `5`
  - measured runs: `20`

## Baseline vs Improved (avg latency)

| Endpoint case | Baseline | Improved | Delta |
|---|---:|---:|---:|
| `/api/sessions/overview?limit=50` | 113.24ms | 32.10ms | -71.7% |
| `/api/sessions/overview?limit=50&channel=telegram` | 77.63ms | 60.32ms | -22.3% |
| `/api/sessions/sess-00042/timeline?limit=100` | 18.11ms | 0.13ms | -99.3% |
| `/api/sessions/sess-00042/timeline?limit=500` | 17.40ms | 0.14ms | -99.2% |
| `/api/sessions/sess-00042/timeline?limit=500&eventType=openclaw.message.processed` | 17.28ms | 7.19ms | -58.4% |

## Changes Applied

Low-risk, backward-compatible index additions in schema bootstrap:

1. `idx_spans_session_key_start`
   - Expression index on resolved session key + `start_time_unix_nano` + `id`
   - Targets timeline lookup + ordering path.
2. `idx_spans_channel_expr`
   - Expression index on resolved channel field.
   - Targets overview channel filter path.
3. `idx_spans_name_start_time`
   - Composite index on `(name, CAST(start_time_unix_nano AS INTEGER))`
   - Helps eventType-constrained queries.

No table rewrites, no breaking schema changes, no API contract changes.

## Recommendation

Keep these indexes.

- Timeline endpoint sees the strongest gains and is likely the most user-visible path in session detail views.
- Overview path also benefits materially, especially unfiltered rollups.
- Write amplification and storage overhead are acceptable for this stage versus read performance wins.

For Phase 3, consider:

- materialized/session rollup table for very large datasets,
- generated columns for frequently queried JSON extractions,
- periodic vacuum/analyze strategy for long-running nodes.

## Environment Notes

- Machine: macOS (arm64), local development run.
- DB engine: SQLite (node:sqlite).
- Numbers are directional and suitable for comparison/regression tracking, not absolute production SLO guarantees.

## Rollback Plan

If index build time or write overhead regresses ingestion in real workloads:

- drop indexes safely via SQL:
  - `DROP INDEX IF EXISTS idx_spans_session_key_start;`
  - `DROP INDEX IF EXISTS idx_spans_channel_expr;`
  - `DROP INDEX IF EXISTS idx_spans_name_start_time;`
- keep code paths unchanged (queries remain valid without these indexes).
