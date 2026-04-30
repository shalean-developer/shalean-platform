import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import { computeBookingEarnings } from "@/lib/payout/computeBookingEarnings";
import { sumEligibleLineItemsSubtotalCents } from "@/lib/payout/computeEarningsFromLineItems";
import { persistBookingCleanerEarningsSnapshot } from "@/lib/payout/persistBookingCleanerEarningsSnapshot";

function resolveBookingDateIso(date: string | null | undefined, time: string | null | undefined): string {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim().slice(0, 5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}$/.test(t)) return `${d}T${t}:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
  return new Date().toISOString();
}

function resolveServiceId(snapshot: unknown, serviceLabel: string | null | undefined): string {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const locked = (snapshot as { locked?: unknown }).locked;
    if (locked && typeof locked === "object" && !Array.isArray(locked)) {
      const parsed = parseBookingServiceId((locked as { service?: unknown }).service);
      if (parsed) return parsed;
    }
  }
  const s = String(serviceLabel ?? "").toLowerCase();
  if (s.includes("deep")) return "deep";
  if (s.includes("move")) return "move";
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("carpet")) return "carpet";
  if (s.includes("quick")) return "quick";
  return "standard";
}

function isValidEarningsShape(e: { display_earnings_cents?: unknown } | null): boolean {
  if (!e) return false;
  const d = Number(e.display_earnings_cents);
  return Number.isFinite(d) && d >= 0;
}

/**
 * Writes / refreshes `booking_cleaner_earnings_snapshot` from line items without mutating `bookings`.
 * For backfills and repair jobs when `display_earnings_cents` was computed before snapshots existed.
 */
export async function recomputeBookingCleanerEarningsSnapshot(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const { data: row } = await admin
    .from("bookings")
    .select("id, cleaner_id, is_team_job, date, time, service, booking_snapshot")
    .eq("id", bookingId)
    .maybeSingle();
  const r = row as {
    id?: string;
    cleaner_id?: string | null;
    is_team_job?: boolean | null;
    date?: string | null;
    time?: string | null;
    service?: string | null;
    booking_snapshot?: unknown;
  } | null;
  if (!r) return { ok: false, error: "Booking not found" };
  if (r.is_team_job === true) return { ok: true, skipped: true };

  const cleanerId = String(r.cleaner_id ?? "").trim();
  if (!cleanerId) return { ok: false, error: "Missing cleaner_id" };

  const { data: li } = await admin.from("booking_line_items").select("id, item_type, total_price_cents").eq("booking_id", bookingId);
  const lineItemRows = (li ?? [])
    .map((x) => x as { id?: string; item_type?: string; total_price_cents?: number })
    .filter((x) => typeof x.id === "string" && typeof x.item_type === "string")
    .map((x) => ({
      id: String(x.id),
      item_type: String(x.item_type),
      total_price_cents: Number(x.total_price_cents) || 0,
    }));

  const sub = sumEligibleLineItemsSubtotalCents(lineItemRows);
  if (sub <= 0 || lineItemRows.length === 0) {
    return { ok: true, skipped: true };
  }

  const bookingDateIso = resolveBookingDateIso(r.date, r.time);
  const serviceId = resolveServiceId(r.booking_snapshot ?? null, r.service ?? null);
  const earnings = await computeBookingEarnings({
    servicePriceCents: sub,
    serviceId,
    cleanerId,
    isTeamJob: false,
    bookingDate: bookingDateIso,
  });
  if (!isValidEarningsShape(earnings)) {
    return { ok: false, error: "Could not compute earnings from line items" };
  }

  const persisted = await persistBookingCleanerEarningsSnapshot({
    admin,
    bookingId,
    cleanerId,
    lineRows: lineItemRows,
    earnings,
  });
  if (!persisted.ok) return { ok: false, error: persisted.error };
  return { ok: true };
}
