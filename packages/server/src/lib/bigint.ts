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
