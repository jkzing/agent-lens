export function formatOffsetMs(offsetNs: number): string {
  return `${(offsetNs / 1_000_000).toFixed(2)} ms`;
}

export function getTimelineTicks(totalNs: number): number[] {
  const totalMs = Math.max(1, totalNs / 1_000_000);
  const targetTicks = 6;
  const roughStep = totalMs / targetTicks;
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
  const stepMs = candidates.find((v) => v >= roughStep) ?? candidates[candidates.length - 1];

  const ticks: number[] = [];
  for (let ms = 0; ms <= totalMs + 1e-6; ms += stepMs) {
    ticks.push(ms * 1_000_000);
  }
  if (ticks[ticks.length - 1] < totalNs) ticks.push(totalNs);
  return ticks;
}

export function formatTick(ns: number): string {
  const ms = ns / 1_000_000;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(ms % 1_000 === 0 ? 0 : 1)}s`;
  if (ms >= 1) return `${Math.round(ms)}ms`;
  return `${ms.toFixed(2)}ms`;
}

export async function exportTrace(traceId: string, format: 'json' | 'csv') {
  const res = await fetch(`/api/traces/${encodeURIComponent(traceId)}/export?format=${format}`);
  if (!res.ok) {
    throw new Error(`Export ${format.toUpperCase()} failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trace-${traceId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
