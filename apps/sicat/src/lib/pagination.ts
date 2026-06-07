export function parsePage(value: unknown, fallback = 1): number {
  const n = Number(value || fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function parsePageSize(value: unknown, fallback = 20, max = 100): number {
  const n = Number(value || fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function toPagedResponse<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number
): { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return { items, page, pageSize, totalItems, totalPages };
}
