import type { PostgrestError } from "@supabase/supabase-js";

type ReadResult = { data: unknown[] | null; error: PostgrestError | null };
type ReadQuery = PromiseLike<ReadResult> & {
  range?: (from: number, to: number) => PromiseLike<ReadResult>;
};

/** Caller supplies a stable, unique ordering. Keep reads below the PostgREST response cap. */
export async function readCleanerQueryPages(query: ReadQuery): Promise<ReadResult> {
  if (typeof query.range !== "function") return await query;
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query.range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}
