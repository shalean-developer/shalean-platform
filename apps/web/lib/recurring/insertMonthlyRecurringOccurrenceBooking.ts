import "server-only";

import crypto from "crypto";

import { getServiceLabel } from "@/components/booking/serviceCategories";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import type { RecurringRowForInsert } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { cloneSnapshotTemplate } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import type { SupabaseClient } from "@supabase/supabase-js";

const FAR_LOCK_DAYS = 120;

/**
 * Recurring occurrence for `billing_type=monthly` + `schedule_type=fixed_schedule`.
 * No per-booking Paystack link; DB trigger attaches to `monthly_invoices` draft.
 */
export async function insertMonthlyRecurringOccurrenceBooking(
  admin: SupabaseClient,
  params: {
    recurring: RecurringRowForInsert;
    occurrenceDateYmd: string;
    customerEmail: string;
    customerName: string | null;
    customerPhone: string | null;
  },
): Promise<{ ok: true; bookingId: string; paystackReference: string } | { ok: false; error: string }> {
  const template = cloneSnapshotTemplate(params.recurring.booking_snapshot_template);
  if (!template?.locked) {
    return { ok: false, error: "recurring_bookings.booking_snapshot_template missing valid locked payload." };
  }

  const priceZar = Math.max(1, Math.round(Number(params.recurring.price)));
  const lockedNow = new Date().toISOString();
  const lockExpiresAt = addDaysYmd(params.occurrenceDateYmd, FAR_LOCK_DAYS);
  const locked: LockedBooking = {
    ...template.locked,
    date: params.occurrenceDateYmd,
    finalPrice: priceZar,
    price: priceZar,
    lockedAt: lockedNow,
    lockExpiresAt: `${lockExpiresAt}T23:59:59+02:00`,
    quoteSignature: undefined,
    booking_id: null,
  };

  const snapshot: BookingSnapshotV1 = {
    v: template.v ?? 1,
    locked,
    customer: template.customer,
    tip_zar: template.tip_zar ?? 0,
    discount_zar: template.discount_zar ?? 0,
    promo_code: template.promo_code ?? null,
    total_zar: priceZar,
  };

  const email = normalizeEmail(params.customerEmail);
  if (!email) return { ok: false, error: "Customer email missing for recurring booking." };

  const paystackReference = `mi_bkg_${crypto.randomUUID()}`;

  const pricing_version_id =
    typeof locked.pricing_version_id === "string" && locked.pricing_version_id.trim()
      ? locked.pricing_version_id.trim()
      : null;

  const { data, error } = await admin
    .from("bookings")
    .insert({
      paystack_reference: paystackReference,
      customer_email: email,
      customer_name: params.customerName,
      customer_phone: params.customerPhone,
      user_id: params.recurring.customer_id,
      amount_paid_cents: 0,
      currency: "ZAR",
      booking_snapshot: snapshot,
      status: "pending",
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
      date: params.occurrenceDateYmd,
      time: locked.time ?? null,
      total_paid_zar: priceZar,
      pricing_version_id,
      price_breakdown: null,
      total_price: null,
      recurring_id: params.recurring.id,
      is_recurring_generated: true,
      is_monthly_billing_booking: true,
      payment_status: "pending_monthly",
      recurring_retry_count: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "duplicate_occurrence" };
    }
    return { ok: false, error: error.message };
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : "";
  if (!id) return { ok: false, error: "Insert returned no id." };
  return { ok: true, bookingId: id, paystackReference };
}
