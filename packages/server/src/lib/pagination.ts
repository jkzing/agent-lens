export type Pagination = { limit: number; offset: number };

export function getPagination(input: { limit?: string; offset?: string }): Pagination {
  const limitParam = Number(input.limit || 100);
  const offsetParam = Number(input.offset || 0);

  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 100;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

  return { limit, offset };
}
