export type Pagination = { limit: number; offset: number };

export function getPagination(input: { limit?: string; offset?: string }): Pagination {
  const limitParam = Number(input.limit || 100);
  const offsetParam = Number(input.offset || 0);

  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 100;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

  return { limit, offset };
}

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

export function normalizeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return Number(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeBigInts(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeBigInts(v)])
    ) as T;
  }

  return value;
}

export function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[\",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
