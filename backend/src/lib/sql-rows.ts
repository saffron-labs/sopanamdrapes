/** `db.execute()` returns an array on postgres-js but `{ rows }` on PGlite. Normalise so code works on both. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return rows ?? [];
}
