import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAudit02A07BookingLineItems } from "@/lib/booking/buildAudit02A07BookingLineItems";
import { persistBookingLineItems } from "@/lib/booking/persistBookingLineItems";

export async function ensureBookingV2R0LineItems(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const id = String(bookingId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid_booking_id" };

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, total_price, booking_snapshot, pricing_summary, price_breakdown, is_team_job")
    .eq("id", id)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false, error: bookingError?.message ?? "booking_not_found" };

  const declaredTotalCents = Math.round(Math.max(0, Number(booking.total_price ?? 0)) * 100);

  const { data: existing, error: existingError } = await admin
    .from("booking_line_items")
    .select("total_price_cents")
    .eq("booking_id", id);
  if (existingError) return { ok: false, error: existingError.message };

  const rows = existing ?? [];
  const existingTotal = rows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  if (rows.length > 0) {
    if (existingTotal !== declaredTotalCents) {
      return { ok: false, error: `existing_line_total_mismatch:${existingTotal}:${declaredTotalCents}` };
    }
    return { ok: true, created: false };
  }

  const built = buildAudit02A07BookingLineItems({
    bookingId: id,
    declaredTotalCents,
    bookingSnapshot: booking.booking_snapshot,
    pricingSummary: booking.pricing_summary,
    priceBreakdown: booking.price_breakdown,
    isTeamJob: booking.is_team_job,
  });
  if (!built.ok) return built;

  const persisted = await persistBookingLineItems(admin, id, built.items);
  if (!persisted.ok) return persisted;

  const { data: verified, error: verifyError } = await admin
    .from("booking_line_items")
    .select("total_price_cents")
    .eq("booking_id", id);
  if (verifyError) return { ok: false, error: verifyError.message };
  const verifiedRows = verified ?? [];
  const verifiedTotal = verifiedRows.reduce((sum, row) => sum + Number(row.total_price_cents ?? 0), 0);
  if (verifiedRows.length === 0 || verifiedTotal !== declaredTotalCents) {
    return { ok: false, error: `persisted_line_total_mismatch:${verifiedTotal}:${declaredTotalCents}` };
  }
  return { ok: true, created: true };
}
