export const PAYOUT_QUERY_PAGE_SIZE = 500;
export const PAYOUT_QUERY_IN_CHUNK_SIZE = 120;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllPayoutRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAYOUT_QUERY_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAYOUT_QUERY_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAYOUT_QUERY_PAGE_SIZE) break;
  }
  return rows;
}

export function payoutQueryChunks<T>(rows: readonly T[], size = PAYOUT_QUERY_IN_CHUNK_SIZE): T[][] {
  const chunkSize = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    out.push(rows.slice(i, i + chunkSize) as T[]);
  }
  return out;
}
