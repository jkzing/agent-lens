export function parseJson(input: string | null): Record<string, any> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
