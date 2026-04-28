import "server-only";

import { getServiceLabel } from "@/components/booking/serviceCategories";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

const DUPLICATE_PENDING_EMAIL_WINDOW_MIN = 20;

/** Avoid duplicate pending_payment rows from double-submit: drop same-email pre-checkout rows in a short window. */
export async function deleteRecentPendingPaymentsForEmail(admin: SupabaseClient, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e) return;
  const since = new Date(Date.now() - DUPLICATE_PENDING_EMAIL_WINDOW_MIN * 60 * 1000).toISOString();
  await admin
    .from("bookings")
    .delete()
    .eq("status", "pending_payment")
    .eq("customer_email", e)
    .gte("created_at", since);
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
      location_id: null,
      city_id: null,
      date: locked.date ?? null,
      time: locked.time ?? null,
      total_paid_zar: null,
      pricing_version_id,
      price_breakdown: null,
      total_price: null,
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
  },
): Promise<{ ok: true } | { ok: false; error: string; pgCode?: string }> {
  const { error } = await admin
    .from("bookings")
    .update({
      booking_snapshot: params.bookingSnapshot,
      price_breakdown: params.priceBreakdown,
      total_price: params.totalPriceZar,
      total_paid_zar: params.totalPaidZar,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      user_id: params.userId,
      location_id: params.locationId,
      city_id: params.cityId,
      surge_multiplier: params.surgeMultiplier,
      surge_reason: params.surgeReason,
      extras: params.extrasSnapshot,
      ...(params.slotDuplicateExempt === true ? { slot_duplicate_exempt: true } : {}),
      ...(params.adminForceSlotOverride === true ? { admin_force_slot_override: true } : {}),
    })
    .eq("id", params.bookingId)
    .eq("status", "pending_payment");

  if (error) return { ok: false, error: error.message, pgCode: error.code };
  return { ok: true };
}
