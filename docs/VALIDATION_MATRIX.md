# Validation Matrix

This matrix defines lightweight checks for refactor/test PRs and pre-release confidence.

| Check name | Command | Validates | Pass criteria | When to run |
| --- | --- | --- | --- | --- |
| Workspace type safety | `pnpm typecheck` | Type contracts across CLI/server/UI remain sound after refactor slices | Exit code `0` with no TypeScript errors | Every PR |
| Server test suite | `pnpm --filter @agent-lens/server test` | Route/service/repository behavior + smoke route contracts | Exit code `0`; all tests pass | Every PR |
| CLI test suite | `pnpm --filter @agent-lens/cli test` | Config/runtime command behavior + CLI smoke command-path wiring | Exit code `0`; all tests pass | Every PR |
| Entry size guardrail | `pnpm check:entry-size` | Entry files stay within soft budget to prevent regression toward monolith files | Exit code `0`; warnings acceptable but no script failure | Every PR |
| Release preflight | `pnpm release:check` | Typecheck + entry-size + builds + package pack sanity | Exit code `0` end-to-end | Pre-release |
