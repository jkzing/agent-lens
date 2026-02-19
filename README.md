# agent-lens

A TS-native observability toolkit for AI agents.

`agent-lens` provides a local OTLP trace receiver, timeline UI, and debugging views for agent workflows.

## Monorepo packages

- `packages/server` — `@agent-lens/server` (OTLP receiver + SQLite + API)
- `packages/ui` — `@agent-lens/ui` (React UI)
- `packages/cli` — `@agent-lens/cli` (CLI entrypoint)

## Local development

```bash
cd ~/w/gh/jkzing/agent-lens
nvm use    # or: fnm use
pnpm install
```

Run server + UI in two terminals:

```bash
# terminal A
pnpm --filter @agent-lens/server dev

# terminal B
pnpm --filter @agent-lens/ui dev
```

- server: `http://localhost:4318`
- UI dev: `http://localhost:5173` (auto-fallback to next port if occupied)

## Published usage

```bash
npx @agent-lens/cli --port 4318
```

> The executable command remains `agent-lens`.

CLI options:

- `--port <number>` (default `4318`)
- `--no-open`

## API endpoints

- `POST /v1/traces` — OTLP traces (protobuf/json)
- `GET /api/traces` — trace summary list
- `GET /api/traces/:traceId` — spans for a trace
- `GET /api/spans` — raw span list

## OpenClaw integration

In OpenClaw config:

```json
{
  "diagnostics": {
    "otel": {
      "endpoint": "http://localhost:4318/v1/traces"
    }
  }
}
```

Then restart OpenClaw and trigger a few agent turns.

## Release process

See: [`docs/RELEASE.md`](docs/RELEASE.md)

It includes:

- version bump rules
- build/typecheck gates
- `pnpm pack` dry-run checks
- npm publish order (`server` → `ui` → `cli`)
- GitHub Actions release workflow (`.github/workflows/release.yml`)

## Demo

- `docs/demo.png`
