# Phase 4 PR1: Minimal OTLP Metrics/Logs Ingestion

## Goal

Add **minimal, low-risk** support for OTLP metrics/logs ingestion so we can receive payloads, persist ingestion records, and inspect health/debug status.

This PR intentionally does **not** redesign trace visualizations or add full metrics/log analytics.

## Scope Delivered

### 1) New OTLP ingest endpoints

- `POST /v1/metrics`
- `POST /v1/logs`

Behavior:

- Accepts `application/json` and `application/x-protobuf` (same shape as traces where practical)
- On invalid payload, returns OTLP-style `partialSuccess` response:
  - metrics: `partialSuccess.rejectedDataPoints`
  - logs: `partialSuccess.rejectedLogRecords`

### 2) Minimal additive storage

Added tables:

- `metric_payloads`
- `log_payloads`

Each row stores:

- `received_at`
- `content_type`
- `payload` (raw JSON / protobuf base64 envelope)
- `parse_status` (`ok`/`error`)
- `parse_error`
- `item_count` (best-effort derived)

Schema changes are additive and backward-compatible.

### 3) Basic visibility endpoints

- `GET /api/metrics/ingest-summary`
- `GET /api/logs/ingest-summary`

Returns:

- total records
- recent records (latest 10)
- `last_received_at`
- parse error count

### 4) Tests

Added/updated tests for:

- metrics/logs ingest success paths
- invalid payload handling
- summary endpoint correctness
- schema bootstrap/migration safety for additive rollout

## Non-Goals (deferred)

- Full metrics time-series modeling
- Logs search/query UX
- Cross-signal correlation UI
- Dashboards/visual analytics beyond ingestion summaries

## What Comes Next (Phase 4 PR2)

Recommended next step:

1. Build normalized/queriable tables for selected high-value metrics/log fields
2. Add filtering windows and lightweight query endpoints (time range/service/session)
3. Introduce first read-only UI panels for metrics/logs next to trace views
4. Add retention/compaction strategy for payload tables
5. Add cross-signal linkage primitives (trace_id / session_key / service.name)
