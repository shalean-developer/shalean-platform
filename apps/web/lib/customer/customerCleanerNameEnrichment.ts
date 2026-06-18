import type { BookingRow } from "@/lib/dashboard/types";

export type CustomerCleanerEnrichableRow = Pick<
  BookingRow,
  "cleaner_id" | "selected_cleaner_id" | "display_cleaner_name"
>;

/**
 * Cleaner UUIDs to resolve for customer dashboard display. `CUSTOMER_BOOKING_SELECT`
 * omits the `cleaners` embed (PostgREST FK ambiguity), so assigned and preferred
 * cleaners are batch-looked up server-side.
 */
export function extractCustomerDisplayCleanerIds(rows: readonly CustomerCleanerEnrichableRow[]): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const assigned = String(r.cleaner_id ?? "").trim();
    if (assigned) {
      out.add(assigned);
      continue;
    }
    const selected = String(r.selected_cleaner_id ?? "").trim();
    if (selected) out.add(selected);
  }
  return Array.from(out);
}

/** Sets `display_cleaner_name` from a batched `cleaners` lookup (assigned wins over preferred). */
export function applyCustomerDisplayCleanerNamesToRows(
  rows: readonly CustomerCleanerEnrichableRow[],
  nameById: ReadonlyMap<string, string>,
): number {
  let mutated = 0;
  for (const r of rows) {
    const assigned = String(r.cleaner_id ?? "").trim();
    const preferred = String(r.selected_cleaner_id ?? "").trim();
    const name =
      (assigned ? nameById.get(assigned) : undefined) ??
      (preferred ? nameById.get(preferred) : undefined);
    if (typeof name === "string" && name.trim()) {
      r.display_cleaner_name = name.trim();
      mutated += 1;
    }
  }
  return mutated;
}
