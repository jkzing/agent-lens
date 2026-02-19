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

## CLI options

- `--port <number>` (default `4318`)
- `--data-dir <path>` (default `~/.agent-lens/data`)
- `--no-open`
- `--config <path>`

## Config file support (TOML first)

Config discovery order (when `--config` is not provided):

1. `~/.agent-lens/config.toml`
2. `~/.agent-lens/config.json`

Merge priority:

`CLI flags > config file > defaults`

Example `~/.agent-lens/config.toml`:

```toml
[server]
port = 4318
dataDir = "/absolute/path/to/.agent-lens/data"

[ui]
open = true
```

Generate the default template file:

```bash
agent-lens config init
```

Validate config file:

```bash
agent-lens config validate
# or
agent-lens config validate --config ~/.agent-lens/config.toml
```

Print resolved runtime config (without starting server):

```bash
agent-lens config print
agent-lens config print --format toml
agent-lens config print --config ~/.agent-lens/config.toml --port 5321 --no-open
```

Run with explicit config path:

```bash
agent-lens --config ~/.agent-lens/config.toml
```

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
