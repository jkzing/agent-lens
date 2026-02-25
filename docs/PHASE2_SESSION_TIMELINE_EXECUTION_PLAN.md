# Phase 2 Execution Plan: Session Timeline

> Date: 2026-02-25  
> Owner: agent-lens  
> Input: `docs/TRACE_VISIBILITY_ANALYSIS_AND_PLAN.md` (Phase 2 section)

## 1) Scope boundary

### In scope (Phase 2)

- Session-level aggregation view on top of existing `spans` data (no new ingestion type).
- Backend read APIs for:
  - session list/overview
  - session timeline detail
- Deterministic session key extraction from span/resource attributes.
- New UI tab/page: **Session Timeline** (read-only browsing + filtering).
- Basic performance guardrails for 10k–100k spans (query/index strategy + pagination limits).

### Out of scope (Phase 2)

- OTLP `/v1/metrics` and `/v1/logs` ingestion.
- Full schema migration with permanent derived columns (Phase 3 candidate).
- Realtime SSE push, alerting, or anomaly detection.
- Major redesign of current Trace Debug panel.

---

## 2) Architecture sketch (session aggregation view)

```text
OTLP spans (existing)
  -> SQLite spans table (existing JSON attrs/resource_attrs)
  -> Session extraction layer (service-level parser)
  -> Session query layer
      - /api/sessions/overview
      - /api/sessions/:sessionKey/timeline
  -> UI: Session Timeline tab
      - session list (left/top)
      - ordered event timeline (main)
      - event detail drawer/panel
```

**Aggregation identity priority** (first non-empty wins):

1. `attributes["openclaw.sessionKey"]`
2. `attributes["openclaw.sessionId"]`
3. `resource_attributes["openclaw.sessionKey"]`
4. `resource_attributes["openclaw.sessionId"]`

If none exists, span is excluded from session views (counted as `unmapped` in overview meta).

---

## 3) Backend plan

## 3.1 API contracts

### `GET /api/sessions/overview`

Query params:

- `limit` (default 50, max 200)
- `offset` (default 0)
- `q` (optional: session key fuzzy match)
- `channel` (optional)
- `eventType` (optional)
- `from` / `to` (optional epoch ms)

Response shape:

```json
{
  "ok": true,
  "items": [
    {
      "session_key": "...",
      "first_seen_unix_nano": 0,
      "last_seen_unix_nano": 0,
      "span_count": 0,
      "trace_count": 0,
      "event_types": ["openclaw.message.processed"],
      "channel": "telegram"
    }
  ],
  "pagination": { "offset": 0, "limit": 50, "total": 0 },
  "meta": { "unmapped_span_count": 0 }
}
```

### `GET /api/sessions/:sessionKey/timeline`

Query params:

- `limit` (default 200, max 1000)
- `offset` (default 0)
- `eventType` (optional)

Response shape:

```json
{
  "ok": true,
  "sessionKey": "...",
  "items": [
    {
      "trace_id": "...",
      "span_id": "...",
      "name": "openclaw.message.processed",
      "start_time_unix_nano": 0,
      "end_time_unix_nano": 0,
      "duration_ns": 0,
      "service_name": "nyx",
      "channel": "telegram",
      "state": "ok",
      "outcome": "success",
      "attributes": "{}",
      "resource_attributes": "{}"
    }
  ],
  "pagination": { "offset": 0, "limit": 200, "total": 0 }
}
```

## 3.2 Parsing strategy (code-level)

- Add shared extractor helper in server service/repository layer:
  - `extractSessionKey(attrs, resourceAttrs): string | null`
  - `extractSessionFields(attrs, resourceAttrs): { sessionKey, sessionId, channel, state, outcome }`
- Keep extractor pure + unit tested with fixture rows.
- Reuse existing `parseJson`/`toNumber` style from `services/traces.ts`.

## 3.3 Query strategy

- Phase 2 keeps source-of-truth in current `spans` table; derive at query time.
- Use SQL JSON extraction (`json_extract`) for grouping/filtering where possible.
- Add practical indexes in Phase 2 only if needed and low-risk:
  - existing time columns (`received_at` / start time) leveraged first.
  - optional expression index behind migration gate if query latency is high.
- Hard-limit page size and require pagination for timeline endpoint.

## 3.4 Backend acceptance criteria

- Endpoints return stable JSON with `ok/items/pagination` pattern.
- Session key fallback order works (priority list above).
- Overview + timeline queries deterministic across repeated calls.
- No regression to existing `/api/traces` and `/api/spans` behavior.

---

## 4) Frontend plan (Session Timeline tab/page)

## 4.1 UI structure

- Add new top-level tab in `App.tsx`: `Session Timeline`.
- New feature module: `packages/ui/src/features/sessions/`:
  - `SessionTimelinePanel.tsx`
  - `useSessionData.ts`
  - `sessionTypes.ts`
  - optional presentational subcomponents for list + timeline rows.

## 4.2 Interactions

- Session list: search (`q`), channel filter, eventType filter, time-range reuse.
- Selecting a session loads timeline events sorted by start time.
- Event click shows detail panel (attributes/resource attrs pretty view + trace jump action).
- “Open Trace” action links to existing Debug trace selection when trace id exists.

## 4.3 UX constraints

- Keep visual language aligned with current shadcn/tailwind patterns in Debug/Overview.
- Default empty states:
  - no sessions found
  - selected session has no items for current filters
- Loading and API error states match current global style.

## 4.4 Frontend acceptance criteria

- New tab is discoverable and does not degrade existing tabs.
- User can complete flow: find session -> inspect ordered events -> jump to trace.
- Filtering updates are debounced or efficient enough to avoid UI jank.

---

## 5) Testing plan

## 5.1 Unit tests

- Server extractor helper tests:
  - key fallback order
  - null/invalid JSON handling
  - field extraction (`channel/state/outcome`)
- UI utility tests for session sorting/filtering transforms.

## 5.2 Integration tests (server)

- Seed SQLite fixture spans with mixed session attributes.
- Verify `/api/sessions/overview` pagination/filter correctness.
- Verify `/api/sessions/:sessionKey/timeline` ordering + totals.

## 5.3 UI tests

- Render Session Timeline tab and load mocked overview/timeline data.
- Validate interaction chain (select session, see timeline, open trace action visible).
- Validate empty/error states.

## 5.4 Validation gate

- For implementation PRs: run targeted tests for changed packages + repo baseline typecheck.
- For this planning-only PR: typecheck skipped.

---

## 6) Risks and mitigations

- **Risk:** Session identifiers inconsistent across agents.  
  **Mitigation:** Explicit fallback order + unmapped count surfaced in API meta/UI.

- **Risk:** JSON extraction query cost at larger data volume.  
  **Mitigation:** limit/offset hard caps, selective filters, Phase 3 migration path for derived columns/indexes.

- **Risk:** User confusion between Trace Debug vs Session Timeline.  
  **Mitigation:** clear tab naming + “Open Trace” bridging action.

- **Risk:** Attribute schema drift (`state/outcome/channel` naming).  
  **Mitigation:** central extractor with alias support and test fixtures.

---

## 7) Definition of Done (Phase 2)

- Backend session overview/timeline APIs merged and documented.
- Session Timeline tab merged with list/detail interactions.
- Tests added (unit + server integration + basic UI interaction).
- Manual check confirms real data can reconstruct at least one multi-event session narrative.
- TODO + docs updated for Phase 2 completion tracking.

---

## 8) Suggested PR slicing (rollout order)

### PR1 — Backend session APIs

- extractor helpers + repository/service/routes
- API docs + server tests
- no UI changes

### PR2 — UI shell + data wiring

- Session Timeline tab/page skeleton
- overview list + timeline fetch + loading/error/empty states
- basic UI tests

### PR3 — Timeline polish + trace bridge

- event detail panel polish
- Open Trace jump action + minor UX improvements
- performance pass (debounce, render optimization)

### PR4 (optional, only if profiling shows need) — query/index hardening

- expression index or derived-column migration prework
- benchmark notes + regression checks

This order keeps each PR reviewable, testable, and low blast-radius while enabling early user feedback after PR2.
