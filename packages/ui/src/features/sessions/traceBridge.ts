export type TraceBridgeResolution =
  | { ok: true; traceId: string }
  | { ok: false; message: string };

export function resolveTraceBridge(traceId: string | null | undefined, traceIds: Set<string>): TraceBridgeResolution {
  if (!traceId) {
    return { ok: false, message: 'This timeline event does not include a trace_id.' };
  }

  if (!traceIds.has(traceId)) {
    return { ok: false, message: `Trace not found for trace_id: ${traceId}` };
  }

  return { ok: true, traceId };
}
