import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAudit02A07BookingLineItems } from "@/lib/booking/buildAudit02A07BookingLineItems";

function evidenceForBooking(row: {
  booking_snapshot?: unknown;
  pricing_summary?: unknown;
  price_breakdown?: unknown;
  is_team_job?: boolean | null;
}) {
  return {
    booking_snapshot: row.booking_snapshot ?? null,
    pricing_summary: row.pricing_summary ?? null,
    price_breakdown: row.price_breakdown ?? null,
    is_team_job: row.is_team_job ?? null,
  };
}

export async function ensureBookingV2R0LineItems(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true; created: true; lineCount: number } | { ok: false; error: string }> {
  const id = String(bookingId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid_booking_id" };

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, status, payment_status, total_price, booking_snapshot, pricing_summary, price_breakdown, is_team_job")
    .eq("id", id)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false, error: bookingError?.message ?? "booking_not_found" };

  const declaredTotalCents = Math.round(Math.max(0, Number(booking.total_price ?? 0)) * 100);
  const built = buildAudit02A07BookingLineItems({
    bookingId: id,
    declaredTotalCents,
    bookingSnapshot: booking.booking_snapshot,
    pricingSummary: booking.pricing_summary,
    priceBreakdown: booking.price_breakdown,
    isTeamJob: booking.is_team_job,
  });
  if (!built.ok) return built;

  const items = built.items.map((item) => ({
    item_type: item.item_type,
    slug: item.slug ?? null,
    name: item.name,
    quantity: item.quantity,
    unit_price_cents: item.unit_price_cents,
    total_price_cents: item.total_price_cents,
    metadata: item.metadata ?? {},
    earns_cleaner: item.earns_cleaner ?? item.item_type !== "adjustment",
  }));

  const { data, error } = await admin.rpc("replace_pending_r0_booking_line_items", {
    p_booking_id: id,
    p_expected_total_cents: declaredTotalCents,
    p_expected_evidence: evidenceForBooking(booking),
    p_items: items,
  });
  if (error) return { ok: false, error: error.message };

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { ok?: unknown; error?: unknown; line_count?: unknown })
      : null;
  if (result?.ok !== true) {
    return { ok: false, error: typeof result?.error === "string" ? result.error : "r0_line_item_rpc_failed" };
  }

  return {
    ok: true,
    created: true,
    lineCount: Number.isFinite(Number(result.line_count)) ? Number(result.line_count) : items.length,
  };
}
