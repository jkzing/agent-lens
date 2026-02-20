# Refactor Plan (Debt Paydown + Long-term Maintainability)

Status: Active (Phase 1-4 complete)
Owner: Lumi
Execution model: small, mergeable PR slices (no big-bang rewrite)

## Why now

Current implementation proved product value fast, but key modules are now too large:

- `packages/ui/src/App.tsx` (~1.5k LOC)
- `packages/server/src/index.ts` (~500 LOC)
- `packages/cli/src/index.ts` (~360 LOC)

This slows review, increases regression risk, and makes multi-agent collaboration harder.

## Refactor goals

1. Reduce cognitive load per file/module
2. Isolate domain logic from transport/UI shell code
3. Keep behavior stable while changing structure
4. Improve testability and future feature velocity

## Non-goals (for this refactor wave)

- No feature redesign
- No storage engine change
- No protocol/API contract rewrite

---

## Target architecture

### Server (`packages/server`)

- `src/index.ts` -> thin bootstrap only
- `src/config/` -> runtime config resolution
- `src/db/` -> db client, schema, migrations, transaction helpers
- `src/repositories/` -> SQL query modules (spans/traces)
- `src/routes/` -> route registration (`/health`, `/v1/traces`, `/api/*`)
- `src/services/` -> OTLP ingest + normalization logic
- `src/lib/` -> shared helpers (pagination, json, bigint normalization)

### CLI (`packages/cli`)

- `src/index.ts` -> command wiring only
- `src/config/` -> parse/load/validate/print/init
- `src/runtime/` -> resolve runtime options and source metadata
- `src/server/` -> server spawn/open browser/shutdown handling
- `src/output/` -> formatter (`json` / `toml`) and UX messaging

### UI (`packages/ui`)

- `src/App.tsx` -> app shell + route/tab composition only
- `src/features/traces/` -> trace list + detail state
- `src/features/waterfall/` -> timeline layout + interactions
- `src/features/config/` -> config display helpers (if needed)
- `src/hooks/` -> data fetching / polling / view state hooks
- `src/lib/` -> parse, type guards, formatting utils
- `src/types/` -> API response contracts

---

## Execution phases

Progress snapshot (2026-02-21):
- Phase 1 complete (PR #17, #18, #19, #20)
- Phase 2 complete (PR #21, #22, #23)
- Phase 3 complete (PR #25, #26, #27, #28, #29, #30, #31)
- Phase 4 complete (PR-1 complete, PR-2 merged via #33, PR-3 in this PR)

## Phase 0 — Baseline and safety rails

- Freeze current behavior with snapshot checks and command-level smoke tests
- Add a lightweight "no behavior change" checklist template for refactor PRs

Done criteria:
- `pnpm typecheck` green
- Existing server/cli smoke checks documented and repeatable

## Phase 1 — Server decomposition

- Extract DB setup/schema/migration into `db/`
- Extract OTLP ingest flow into `services/ingest.ts`
- Extract API handlers into route modules
- Keep SQL statements unchanged in this phase

Done criteria:
- Same API output shape as before
- Same startup/runtime behavior
- `packages/server/src/index.ts` reduced to bootstrap wiring (~120 LOC target)

## Phase 2 — CLI decomposition

- Move config loading/validation into `config/`
- Move runtime resolution into `runtime/`
- Move process spawning into `server/launcher.ts`
- Keep command UX/flags unchanged

Done criteria:
- Command surface unchanged
- `src/index.ts` reduced to command composition (~120 LOC target)

## Phase 3 — UI decomposition

- Split data logic into hooks
- Split timeline/waterfall rendering into feature components
- Split detail panel and trace list into separate feature modules
- Preserve UI behavior and visual output

Done criteria:
- `App.tsx` primarily orchestration (<300 LOC target)
- Existing interactions remain intact (filters, selection, detail, timeline)

## Phase 4 — Test and quality expansion

- Add focused unit tests for extracted pure modules
- Add minimal integration smoke checks for CLI/server paths
- Add size/coupling checks (simple script or CI warning)

Done criteria:
- Critical extracted modules covered by tests
- CI remains stable and release workflow unaffected
- Validation matrix documented (`docs/VALIDATION_MATRIX.md`) and used in PR/release checks

---

## PR strategy

- One phase = multiple small PRs (prefer 1 concern per PR)
- Each PR must include:
  - behavior parity note
  - validation commands + outputs
  - rollback note

Naming convention examples:
- `refactor(server): extract db bootstrap module`
- `refactor(cli): isolate config loader`
- `refactor(ui): extract waterfall feature module`

---

## Success metrics

- File size reduction in core entry files:
  - server index <= 120 LOC
  - cli index <= 120 LOC
  - ui App <= 300 LOC
- Lower PR review noise (smaller diffs, clearer ownership)
- Faster feature iteration after split (measured by cycle time informally)

---

## Immediate next step

Start the next roadmap slice (post-refactor feature work), using `docs/VALIDATION_MATRIX.md` as the default PR/pre-release check baseline.
