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
  - `maxStringLength`
  - `inputFieldAllowlist`
  - `outputFieldAllowlist`
  - optional `emitSpan(event)` callback for telemetry emission

## Privacy posture (PR50)

Telemetry emitted under `openclaw.tool.call` is now **allowlist-first and redaction-safe**:

- Core lifecycle fields are always preserved for compatibility:
  - `toolName`, `sessionKey`, `status`, `durationMs`, `error`
- By default, raw tool payload bodies are **not emitted**.
  - No raw `args`
  - No raw `result`
- Optional payload attributes are emitted only from explicit allowlists:
  - `inputFieldAllowlist` for `before_tool_call` args
  - `outputFieldAllowlist` for `tool_result_persist` result
- Sensitive keys are dropped even if allowlisted:
  - `token`, `cookie`, `authorization` / `auth`, `apiKey`, `password`, `secret`, `path`, `filePath`
- String values are truncated with `maxStringLength`.

## MVP behavior implemented

The plugin emits tool lifecycle spans/events from both hook points (when tool is included):

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
- optional sanitized attributes:
  - `input` (allowlisted + redacted)
  - `output` (allowlisted + redacted)

If `emitSpan` is not provided, hooks remain no-op for telemetry and stay backward-compatible.

## Quick start

```ts
import { createOpenClawPlugin } from '@agent-lens/openclaw-plugin';

const plugin = createOpenClawPlugin({
  enabled: true,
  sampleRate: 1,
  includeTools: ['web_search'],
  maxStringLength: 80,
  inputFieldAllowlist: ['query', 'timeoutMs'],
  outputFieldAllowlist: ['status', 'itemsCount'],
  emitSpan: (event) => {
    console.log(event.name, event.attributes);
  }
});

plugin.before_tool_call({
  toolName: 'web_search',
  sessionKey: 'sess-1',
  callKey: 'call-1',
  args: {
    query: 'agent lens',
    token: 'this-will-be-dropped'
  }
});

plugin.tool_result_persist({
  toolName: 'web_search',
  sessionKey: 'sess-1',
  callKey: 'call-1',
  success: true,
  result: {
    status: 'ok',
    path: '/tmp/private.json'
  }
});
```

Example emitted attributes:

```ts
{
  toolName: 'web_search',
  sessionKey: 'sess-1',
  status: 'success',
  durationMs: 3,
  input: { query: 'agent lens' },
  output: { status: 'ok' }
}
```

## Boundaries (current)

This package still does **not** implement:

- transport/client wiring to backend collectors
- persistent storage
- retry/backoff, buffering, or batching
- OpenClaw runtime integration code

It intentionally keeps emission logic minimal and embeddable.
