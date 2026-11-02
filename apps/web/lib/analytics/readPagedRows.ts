/**
 * Read all pages from a bounded PostgREST query. Each page is rebuilt so
 * .range() is applied once to a fresh query rather than mutating prior state.
 * A full final page is followed by one empty probe; reaching the safety
 * boundary fails closed rather than silently returning partial analytics.
 */
export async function readPagedRows<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  pageSize = 1_000,
  maxRows = 50_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 ||
      !Number.isSafeInteger(maxRows) || maxRows <= 0 || maxRows % pageSize !== 0) {
    return { data: [], error: { message: "Invalid pagination bounds." } };
  }
  const collected: T[] = [];
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const result = await buildQuery().range(offset, offset + pageSize - 1);
    if (result.error) return { data: [], error: result.error };
    const page = result.data ?? [];
    if (page.length > pageSize) {
      return { data: [], error: { message: "Analytics page exceeds configured size." } };
    }
    if (offset + page.length > maxRows) {
      return { data: [], error: { message: "Analytics row safety limit reached; exact totals unavailable." } };
    }
    collected.push(...page);
    if (page.length < pageSize) return { data: collected, error: null };
  }
  return { data: [], error: { message: "Analytics row safety limit reached; exact totals unavailable." } };
}
