# @agent-lens/openclaw-plugin

Scaffold package for OpenClaw hook-based telemetry integration in agent-lens.

## Intent

Provide a small, testable plugin entry point that can be embedded by OpenClaw runtime code to report tool-call lifecycle events into agent-lens.

Current scaffold includes:

- plugin factory: `createOpenClawPlugin`
- hook stubs:
  - `before_tool_call`
  - `tool_result_persist`
- config parsing/types:
  - `enabled`
  - `sampleRate`
  - `includeTools`

## Boundaries (MVP)

This package currently does **not** implement:

- transport/client wiring to any backend
- persistent storage
- full telemetry event schema
- retry/backoff, buffering, or batching
- OpenClaw runtime integration code

It is intentionally scaffold-only to keep blast radius low.

## Quick start

```ts
import { createOpenClawPlugin } from '@agent-lens/openclaw-plugin';

const plugin = createOpenClawPlugin({
  enabled: true,
  sampleRate: 1,
  includeTools: ['web_search']
});

plugin.before_tool_call({ toolName: 'web_search', args: { query: 'agent lens' } });
plugin.tool_result_persist({ toolName: 'web_search', success: true, result: { ok: true } });
```

## TODO roadmap

1. Define stable hook payload schemas aligned with OpenClaw lifecycle.
2. Add telemetry event mapper (tool call/result -> agent-lens record shape).
3. Add optional OTLP/HTTP writer and backpressure strategy.
4. Add richer validation + warning surfaces.
5. Add contract tests against real OpenClaw hook fixtures.
