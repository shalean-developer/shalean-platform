import type { BookingRow } from "@/lib/dashboard/types";

export type CustomerCleanerEnrichableRow = Pick<
  BookingRow,
  "cleaner_id" | "selected_cleaner_id" | "display_cleaner_name" | "id" | "cleaner_count"
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

/** Paired roster jobs (`cleaner_count` >= 2) show every assigned cleaner on the customer dashboard. */
export function applyPairedRosterDisplayCleanerNames(
  rows: readonly CustomerCleanerEnrichableRow[],
  rosterByBookingId: ReadonlyMap<string, readonly { full_name: string | null; role: string }[]>,
): number {
  let mutated = 0;
  for (const row of rows) {
    const bookingId = String(row.id ?? "").trim();
    if (!bookingId) continue;
    const cleanerCount = Number(row.cleaner_count ?? 1) || 1;
    if (cleanerCount < 2) continue;
    const roster = rosterByBookingId.get(bookingId);
    if (!roster || roster.length < 2) continue;
    row.display_cleaner_name = roster
      .map((member) => member.full_name?.trim() || "Cleaner")
      .join(", ");
    mutated += 1;
  }
  return mutated;
}
