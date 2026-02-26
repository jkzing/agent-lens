# @agent-lens/openclaw-plugin

Scaffold package for OpenClaw hook-based telemetry integration in agent-lens.

## Intent

Provide a small, testable plugin entry point that can be embedded by OpenClaw runtime code to report tool-call lifecycle events into agent-lens.

Current scaffold includes:

- plugin factory: `createOpenClawPlugin`
- hook handlers:
  - `before_tool_call`
  - `tool_result_persist`
- config parsing/types:
  - `enabled`
  - `sampleRate`
  - `includeTools`
  - optional `emitSpan(event)` callback for MVP telemetry emission

## MVP behavior implemented

The plugin now emits real tool lifecycle spans/events from both hook points.

- default event name: `openclaw.tool.call`
- emitted at:
  - `before_tool_call`
  - `tool_result_persist`
- minimum attributes included:
  - `toolName`
  - `sessionKey` (when provided)
  - `status` (`success` / `error`)
  - `durationMs` (from explicit payload or in-memory start/end timing)
  - `error` (only on error, concise)

If `emitSpan` is not provided, hooks remain no-op for telemetry and stay backward-compatible.

## Quick start

```ts
import { createOpenClawPlugin } from '@agent-lens/openclaw-plugin';

const plugin = createOpenClawPlugin({
  enabled: true,
  sampleRate: 1,
  includeTools: ['web_search'],
  emitSpan: (event) => {
    console.log(event.name, event.attributes);
  }
});

plugin.before_tool_call({
  toolName: 'web_search',
  sessionKey: 'sess-1',
  callKey: 'call-1',
  args: { query: 'agent lens' }
});

plugin.tool_result_persist({
  toolName: 'web_search',
  sessionKey: 'sess-1',
  callKey: 'call-1',
  success: true,
  result: { ok: true }
});
```

## Boundaries (current)

This package still does **not** implement:

- transport/client wiring to backend collectors
- persistent storage
- retry/backoff, buffering, or batching
- OpenClaw runtime integration code

It intentionally keeps emission logic minimal and embeddable.
