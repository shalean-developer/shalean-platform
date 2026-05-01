import "server-only";

import { getServiceLabel } from "@/components/booking/serviceCategories";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { buildPriceSnapshotV1Checkout } from "@/lib/booking/priceSnapshotBooking";
import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { persistBookingLineItems } from "@/lib/booking/persistBookingLineItems";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { resolveTenureBasedCleanerShareForBookingRow } from "@/lib/payout/tenureBasedCleanerLineShare";

function provisionalPriceSnapshotFromLocked(locked: LockedBooking): Record<string, unknown> {
  const total = Math.round(
    typeof locked.finalPrice === "number" && Number.isFinite(locked.finalPrice) ? locked.finalPrice : 0,
  );
  const st =
    locked.service && String(locked.service).trim() ? adminBookingServiceSlug(String(locked.service)) : "standard";
  return buildPriceSnapshotV1Checkout({
    service_type: st,
    base_price: total,
    extras: [],
    total_price: total,
  }) as Record<string, unknown>;
}

/** Removes a stale `pending_payment` row for the same Paystack reference only (never scoped by email). */
export async function deletePendingPaymentBookingsWithPaystackReference(
  admin: SupabaseClient,
  paystackReference: string,
): Promise<void> {
  const ref = paystackReference.trim();
  if (!ref) return;
  await admin.from("bookings").delete().eq("status", "pending_payment").eq("paystack_reference", ref);
}

export type PendingPaymentInsertResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Creates `bookings` row before Paystack initialize so `paystack_reference` is known and
 * `normalizeJobSubtotalSplitZar` / metadata can carry `bookingId`. Status stays out of dispatch (`pending_payment`).
 */
export async function insertPendingPaymentBookingRow(
  admin: SupabaseClient,
  params: {
    paystackReference: string;
    locked: LockedBooking;
    customerEmail: string;
    /** When known at insert time, dispatch / assignCleaner can match cleaners immediately. */
    locationId?: string | null;
    cityId?: string | null;
  },
): Promise<PendingPaymentInsertResult> {
  const email = params.customerEmail.trim().toLowerCase();
  const locked = params.locked;
  const pricing_version_id =
    typeof locked.pricing_version_id === "string" && locked.pricing_version_id.trim()
      ? locked.pricing_version_id.trim()
      : null;

  const minimalSnapshot: BookingSnapshotV1 = {
    v: 1,
    locked,
  };

  const serviceSlug =
    typeof locked.service === "string" && locked.service.trim() ? adminBookingServiceSlug(locked.service) : null;

  const lid =
    typeof params.locationId === "string" && /^[0-9a-f-]{36}$/i.test(params.locationId.trim())
      ? params.locationId.trim().toLowerCase()
      : null;
  const cid =
    typeof params.cityId === "string" && /^[0-9a-f-]{36}$/i.test(params.cityId.trim())
      ? params.cityId.trim().toLowerCase()
      : null;

  const { data, error } = await admin
    .from("bookings")
    .insert({
      paystack_reference: params.paystackReference,
      customer_email: email,
      customer_name: null,
      customer_phone: null,
      user_id: null,
      amount_paid_cents: 0,
      currency: "ZAR",
      booking_snapshot: minimalSnapshot,
      ...(serviceSlug ? { service_slug: serviceSlug } : {}),
      status: "pending_payment",
      dispatch_status: "searching",
      surge_multiplier: 1,
      surge_reason: null,
      service: locked.service != null ? getServiceLabel(locked.service) : null,
      rooms: locked.rooms ?? null,
      bathrooms: locked.bathrooms ?? null,
      extras: [],
      location: locked.location?.trim() || null,
      location_id: lid,
      city_id: cid,
      date: locked.date ?? null,
      time: locked.time ?? null,
      total_paid_zar: null,
      pricing_version_id,
      price_breakdown: null,
      total_price: null,
      price_snapshot: provisionalPriceSnapshotFromLocked(locked),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : "";
  if (!id) return { ok: false, error: "Insert returned no id." };
  return { ok: true, id };
}

export async function deletePendingPaymentBooking(admin: SupabaseClient, bookingId: string): Promise<void> {
  await admin.from("bookings").delete().eq("id", bookingId).eq("status", "pending_payment");
}

export async function updatePendingPaymentBookingForInit(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    bookingSnapshot: BookingSnapshotV1 | Record<string, unknown>;
    priceBreakdown: Record<string, unknown> | null;
    totalPriceZar: number | null;
    totalPaidZar: number;
    customerName: string | null;
    customerPhone: string | null;
    userId: string | null;
    locationId: string | null;
    cityId: string | null;
    surgeMultiplier: number;
    surgeReason: string | null;
    extrasSnapshot: unknown[];
    /** Admin "Create anyway" — excluded from partial unique slot index; audit flag. */
    slotDuplicateExempt?: boolean;
    adminForceSlotOverride?: boolean;
    /** Admin create: preferred cleaner before payment (`cleaners.id`). */
    selected_cleaner_id?: string | null;
    assignment_type?: string | null;
    price_snapshot?: Record<string, unknown> | null;
    /** When set, persisted to `booking_line_items` after the row update (must sum to `totalPriceZar` in cents). */
    checkoutLineItems?: readonly BookingLineItemInsert[] | null;
    /**
     * When false, line-item persist failure does not delete the booking row (reuse / backfill path).
     * Default true (new pending row from Paystack init).
     */
    deleteRowOnLineItemPersistFail?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string; pgCode?: string }> {
  const extrasPersist = sanitizeBookingExtrasForPersist(params.extrasSnapshot, {
    where: "updatePendingPaymentBookingForInit",
    bookingId: params.bookingId,
  });

  const { data: row0, error: row0Err } = await admin
    .from("bookings")
    .select("date, time, cleaner_id, selected_cleaner_id")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (row0Err) {
    return { ok: false, error: row0Err.message, pgCode: row0Err.code };
  }
  if (!row0) {
    return { ok: false, error: "Booking not found for pending update.", pgCode: undefined };
  }
  const r0 = row0 as {
    date?: string | null;
    time?: string | null;
    cleaner_id?: string | null;
    selected_cleaner_id?: string | null;
  } | null;
  const cleanerForTenure =
    (params.selected_cleaner_id && /^[0-9a-f-]{36}$/i.test(params.selected_cleaner_id)
      ? params.selected_cleaner_id
      : null) ??
    (r0?.selected_cleaner_id && /^[0-9a-f-]{36}$/i.test(String(r0.selected_cleaner_id)) ? String(r0.selected_cleaner_id) : null) ??
    (r0?.cleaner_id && /^[0-9a-f-]{36}$/i.test(String(r0.cleaner_id)) ? String(r0.cleaner_id) : null);
  const tenureShare = await resolveTenureBasedCleanerShareForBookingRow({
    admin,
    cleanerId: cleanerForTenure,
    bookingDate: r0?.date ?? null,
    bookingTime: r0?.time ?? null,
  });

  const { error } = await admin
    .from("bookings")
    .update({
      booking_snapshot: params.bookingSnapshot,
      price_breakdown: params.priceBreakdown,
      total_price: params.totalPriceZar,
      ...(params.price_snapshot && typeof params.price_snapshot === "object"
        ? { price_snapshot: params.price_snapshot }
        : {}),
      total_paid_zar: params.totalPaidZar,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      user_id: params.userId,
      location_id: params.locationId,
      city_id: params.cityId,
      surge_multiplier: params.surgeMultiplier,
      surge_reason: params.surgeReason,
      extras: extrasPersist,
      ...(params.slotDuplicateExempt === true ? { slot_duplicate_exempt: true } : {}),
      ...(params.adminForceSlotOverride === true ? { admin_force_slot_override: true } : {}),
      ...(params.selected_cleaner_id && /^[0-9a-f-]{36}$/i.test(params.selected_cleaner_id)
        ? {
            selected_cleaner_id: params.selected_cleaner_id,
            assignment_type: params.assignment_type ?? "user_selected",
          }
        : {}),
      ...(tenureShare != null ? { cleaner_share_percentage: tenureShare } : {}),
    })
    .eq("id", params.bookingId)
    .eq("status", "pending_payment");

  if (error) return { ok: false, error: error.message, pgCode: error.code };

  const deleteOnFail = params.deleteRowOnLineItemPersistFail !== false;
  const lineItems = params.checkoutLineItems;
  if (lineItems && lineItems.length > 0) {
    const { count, error: ctErr } = await admin
      .from("booking_line_items")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", params.bookingId);
    const existing = typeof count === "number" ? count : 0;
    if (ctErr) {
      if (deleteOnFail) {
        await admin.from("bookings").delete().eq("id", params.bookingId).eq("status", "pending_payment");
      }
      return { ok: false, error: ctErr.message || "Could not verify booking line items." };
    }
    if (existing === 0) {
      const persisted = await persistBookingLineItems(admin, params.bookingId, lineItems);
      if (!persisted.ok) {
        if (deleteOnFail) {
          await admin.from("bookings").delete().eq("id", params.bookingId).eq("status", "pending_payment");
        }
        return { ok: false, error: persisted.error || "Could not save booking line items." };
      }
    }
  }

  return { ok: true };
}
