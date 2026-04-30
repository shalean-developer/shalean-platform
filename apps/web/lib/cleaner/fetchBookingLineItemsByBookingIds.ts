import "server-only";

import type { CleanerBookingLineItemWire } from "@/lib/cleaner/cleanerBookingRow";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK = 80;

/**
 * Batch-load `booking_line_items` for cleaner job payloads (service role).
 */
export async function fetchBookingLineItemsByBookingIds(
  admin: SupabaseClient,
  bookingIds: readonly string[],
): Promise<Map<string, CleanerBookingLineItemWire[]>> {
  const out = new Map<string, CleanerBookingLineItemWire[]>();
  const ids = [...new Set(bookingIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("booking_line_items")
      .select("booking_id, item_type, slug, name, quantity")
      .in("booking_id", slice)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[fetchBookingLineItemsByBookingIds]", error.message);
      continue;
    }
    for (const raw of data ?? []) {
      const r = raw as Record<string, unknown>;
      const bid = typeof r.booking_id === "string" ? r.booking_id : "";
      if (!bid) continue;
      const row: CleanerBookingLineItemWire = {
        item_type: typeof r.item_type === "string" ? r.item_type : "",
        slug: typeof r.slug === "string" ? r.slug : null,
        name: typeof r.name === "string" ? r.name : "",
        quantity: typeof r.quantity === "number" && Number.isFinite(r.quantity) ? Math.max(1, Math.floor(r.quantity)) : 1,
      };
      if (!out.has(bid)) out.set(bid, []);
      out.get(bid)!.push(row);
    }
  }
  return out;
}
