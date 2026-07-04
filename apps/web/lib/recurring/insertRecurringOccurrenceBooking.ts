import "server-only";

import crypto from "crypto";

import { getServiceLabel } from "@/components/booking/serviceCategories";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { provisionalPriceSnapshotJson } from "@/lib/booking/provisionalPriceSnapshotFromLocked";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { lockedDurationMinutesPatch } from "@/lib/booking/durationMinutesIntegrity";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import {
  findActiveCustomerSlotOccupant,
  recurringBookingCustomerOwnershipPatch,
  recurringPlanOccurrenceRowExists,
} from "@/lib/recurring/recurringBookingInsertGuards";
import {
  recurringOccurrenceCleanerPatch,
  resolveRecurringPreferredCleanerId,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import { fetchLastAssignedCleanerForRecurringPlan } from "@/lib/recurring/fetchLastAssignedCleanerForRecurringPlan";
import { scheduleBookingPaymentRecoveryJobs } from "@/lib/booking/bookingPaymentRecoveryJobs";
import type { SupabaseClient } from "@supabase/supabase-js";

const FAR_LOCK_DAYS = 120;

export type RecurringRowForInsert = {
  id: string;
  customer_id: string;
  price: number | string;
  booking_snapshot_template: unknown;
  /**
   * **M-6**: customer/admin-editable preferred cleaner. Optional for backwards compatibility —
   * legacy callers that omit this field still benefit from the snapshot-template fallback chain
   * inside {@link resolveRecurringPreferredCleanerId}.
   */
  preferred_cleaner_id?: string | null;
};

export function cloneSnapshotTemplate(raw: unknown): BookingSnapshotV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const locked = parseLockedBookingFromUnknown(o.locked ?? null);
  if (!locked) return null;
  const v = typeof o.v === "number" ? o.v : 1;
  return {
    v,
    locked,
    ...(typeof o.customer === "object" && o.customer !== null ? { customer: o.customer as BookingSnapshotV1["customer"] } : {}),
    ...(typeof o.tip_zar === "number" ? { tip_zar: o.tip_zar } : {}),
    ...(typeof o.discount_zar === "number" ? { discount_zar: o.discount_zar } : {}),
    ...(typeof o.promo_code === "string" ? { promo_code: o.promo_code } : {}),
    ...(typeof o.total_zar === "number" ? { total_zar: o.total_zar } : {}),
  };
}

/**
 * Inserts a `pending_payment` booking row for one recurring occurrence (idempotent via DB unique index).
 */
export async function insertRecurringOccurrenceBooking(
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

  const paystackReference = `rec_${crypto.randomUUID()}`;

  const pricing_version_id =
    typeof locked.pricing_version_id === "string" && locked.pricing_version_id.trim()
      ? locked.pricing_version_id.trim()
      : null;

  if (await recurringPlanOccurrenceRowExists(admin, params.recurring.id, params.occurrenceDateYmd)) {
    return { ok: false, error: "duplicate_occurrence" };
  }

  const serviceSlug =
    typeof locked.service === "string" && locked.service.trim()
      ? adminBookingServiceSlug(String(locked.service))
      : "standard";

  /**
   * **M-6**: copy the customer's preferred cleaner onto the new occurrence as
   * `selected_cleaner_id` + `assignment_type='user_selected'`. Resolution order:
   * recurring column → last assigned occurrence → snapshot.locked.cleaner_id → snapshot.cleaner_id.
   */
  const lastAssignedCleanerId = await fetchLastAssignedCleanerForRecurringPlan(admin, params.recurring.id);
  const preferredCleanerId = resolveRecurringPreferredCleanerId({
    recurringPreferredCleanerId: params.recurring.preferred_cleaner_id ?? null,
    lastAssignedCleanerId,
    snapshotTemplate: template,
  });
  const cleanerPatch = recurringOccurrenceCleanerPatch(preferredCleanerId, {
    operationalStatus: "pending_payment",
  });

  const customerOwnershipPatch = await recurringBookingCustomerOwnershipPatch(
    admin,
    params.recurring.customer_id,
  );

  const baseRow = {
    paystack_reference: paystackReference,
    customer_email: email,
    customer_name: params.customerName,
    customer_phone: params.customerPhone,
    ...customerOwnershipPatch,
    amount_paid_cents: 0,
    currency: "ZAR",
    booking_snapshot: snapshot,
    ...lockedDurationMinutesPatch(locked),
    status: "pending_payment" as const,
    dispatch_status: "searching" as const,
    surge_multiplier: 1,
    surge_reason: null,
    service: locked.service != null ? getServiceLabel(locked.service) : null,
    service_slug: serviceSlug,
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
    price_snapshot: provisionalPriceSnapshotJson(locked),
    recurring_id: params.recurring.id,
    is_recurring_generated: true,
    payment_status: "pending" as const,
    recurring_retry_count: 0,
    ...cleanerPatch,
  };

  const insertRow = (slotDuplicateExempt: boolean) =>
    admin
      .from("bookings")
      .insert({
        ...baseRow,
        ...(slotDuplicateExempt ? { slot_duplicate_exempt: true } : {}),
      })
      .select("id")
      .maybeSingle();

  let { data, error } = await insertRow(false);

  if (error?.code === "23505") {
    if (await recurringPlanOccurrenceRowExists(admin, params.recurring.id, params.occurrenceDateYmd)) {
      return { ok: false, error: "duplicate_occurrence" };
    }
    const occupant = await findActiveCustomerSlotOccupant(admin, {
      userId: params.recurring.customer_id,
      dateYmd: params.occurrenceDateYmd,
      time: locked.time ?? null,
      serviceSlug,
    });
    const occupantRecurring = occupant?.recurring_id != null ? String(occupant.recurring_id) : null;
    if (occupant && occupantRecurring === params.recurring.id) {
      return { ok: false, error: "duplicate_occurrence" };
    }
    if (occupant) {
      const second = await insertRow(true);
      data = second.data;
      error = second.error;
    } else {
      if (await recurringPlanOccurrenceRowExists(admin, params.recurring.id, params.occurrenceDateYmd)) {
        return { ok: false, error: "duplicate_occurrence" };
      }
      return { ok: false, error: error.message };
    }
  }

  if (error) {
    if (error.code === "23505") {
      if (await recurringPlanOccurrenceRowExists(admin, params.recurring.id, params.occurrenceDateYmd)) {
        return { ok: false, error: "duplicate_occurrence" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : "";
  if (!id) return { ok: false, error: "Insert returned no id." };

  void scheduleBookingPaymentRecoveryJobs(admin, {
    bookingId: id,
    customerEmail: email,
    createdAt: new Date().toISOString(),
  });

  return { ok: true, bookingId: id, paystackReference };
}
