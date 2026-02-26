export const TOOL_CALL_SPAN_NAME = 'openclaw.tool.call';

export type ToolCallStatus = 'success' | 'error';

export interface ToolCallSpanAttributes {
  toolName: string;
  sessionKey?: string;
  status: ToolCallStatus;
  durationMs: number;
  error?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ToolCallSpanEvent {
  name: string;
  attributes: ToolCallSpanAttributes;
}

export type TelemetryEmitter = (event: ToolCallSpanEvent) => void;

export function normalizeErrorMessage(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }

  if (typeof error === 'string') {
    return error.slice(0, 240);
  }

  if (error instanceof Error) {
    return error.message.slice(0, 240);
  }

  try {
    return JSON.stringify(error).slice(0, 240);
  } catch {
    return 'unknown_error';
  }
}

export function emitToolCallSpan(
  emitSpan: TelemetryEmitter | undefined,
  attributes: ToolCallSpanAttributes
): void {
  if (!emitSpan) {
    return;
  }

  emitSpan({
    name: TOOL_CALL_SPAN_NAME,
    attributes
  });
}
