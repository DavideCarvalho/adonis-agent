/**
 * Exact-match metadata filter (every key in `filter` must equal the record's). Used by the in-memory
 * {@link import('./memory-vector-store.js').MemoryVectorStore}. Pure and dependency-free.
 */
export function matchesFilter(
  metadata: Record<string, unknown> | undefined,
  filter: Record<string, unknown>,
): boolean {
  if (metadata === undefined) {
    return Object.keys(filter).length === 0;
  }
  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}
