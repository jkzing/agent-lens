# agent-lens TODO

## Milestones

- M1 · Core UI experience polish
- M2 · Agent context mapping
- M3 · Analysis enhancements
- M4 · Realtime + data source expansion

---

## M1 status

- [x] Waterfall timeline redesign (Gantt style + hierarchy)
- [x] Span Events rendering in detail panel
- [x] Search and filtering (trace + span)
- [x] API base switched to relative path (remove hardcoded API_BASE)
- [ ] Design system consolidation follow-up (component consistency pass)

---

## Configuration support roadmap

- [x] TOML-first config loading in CLI (JSON fallback, discovery, `--config`)
- [x] Runtime merge priority (`CLI > config > defaults`)
- [x] `agent-lens config init` and `agent-lens config validate`
- [x] Server `DATA_DIR` env support
- [x] Add `agent-lens config print` for resolved runtime config
- [ ] Extend schema validation (unknown key warnings, richer diagnostics)
- [ ] Add optional `--show-sources/--no-sources` toggle for `config print` output verbosity
- [ ] Add unit tests for config parser/validator
- [ ] Support environment variable interpolation in config values

---

## Refactor roadmap (architecture + maintainability)

- [x] Create refactor master plan (`docs/REFACTOR_PLAN.md`)
- [x] Phase 1: server decomposition (`index.ts` -> config/db/routes/services split)
- [x] Phase 2: CLI decomposition (`index.ts` -> command/config/runtime/launcher split)
- [x] Phase 3: UI decomposition (`App.tsx` -> feature modules + hooks)
- [ ] Phase 4: tests and quality guardrails for extracted modules
  - [x] PR-1: add entry-file size budget checks (`check:entry-size`) and wire into release preflight
  - [ ] PR-2: expand focused unit coverage for extracted pure modules
  - [ ] PR-3: add minimal integration smoke checks and document validation matrix

## M2 · Agent context mapping

- [ ] Link traces to chat/session context
- [ ] Cost breakdown by model/provider
- [ ] Trace export polish (JSON / CSV UX)

## M3 · Analysis enhancements

- [ ] Improve loop detection algorithm
- [ ] Error aggregation view and trend
- [ ] Trace retention strategy + manual cleanup tools

## M4 · Realtime + data sources

- [ ] Replace polling with SSE push updates
- [ ] Integrate `/tmp/openclaw-cachetrace.jsonl` fallback data source
