import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { lockedDurationMinutesPatch } from "@/lib/booking/durationMinutesIntegrity";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { provisionalPriceSnapshotJson } from "@/lib/booking/provisionalPriceSnapshotFromLocked";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import type { RecurringPlanScheduleRow } from "@/lib/recurring/reconcileRecurringPlanOccurrences";
import {
  collectDraftInvoiceIdsForRecurringPlan,
  reconcileRecurringPlanOccurrences,
} from "@/lib/recurring/reconcileRecurringPlanOccurrences";
import { cloneSnapshotTemplate } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import {
  recurringOccurrenceCleanerPatch,
  recurringPropagateCleanerOperationalStatus,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import { applyRecurringOccurrenceRosterContinuity } from "@/lib/recurring/applyRecurringOccurrenceRosterContinuity";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { syncDraftMonthlyInvoiceToZohoAfterRecompute } from "@/lib/monthlyInvoice/syncMonthlyInvoiceToZohoBooks";

export type RecurringPlanPropagationResult = {
  ok: true;
  schedule_reconciled: boolean;
  months_reconciled: number;
  bookings_cancelled: number;
  bookings_created: number;
  bookings_cancel_skipped: number;
  bookings_cancel_skipped_locked_invoice: number;
  bookings_cancel_skipped_locked_payout: number;
  bookings_updated: number;
  bookings_cleaner_updated: number;
  bookings_skipped_finalized: number;
  bookings_skipped_locked_invoice: number;
  earnings_recomputed: number;
  earnings_skipped: number;
  invoices_recomputed: number;
  errors: string[];
};

type RecurringPlanRow = RecurringPlanScheduleRow;

type GeneratedBookingRow = {
  id: string;
  date: string | null;
  status: string | null;
  cleaner_line_earnings_finalized_at: string | null;
  monthly_invoice_id: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  invoice_status: string | null;
};

function buildOccurrenceSnapshot(
  plan: RecurringPlanRow,
  occurrenceDateYmd: string,
): { snapshot: BookingSnapshotV1; locked: LockedBooking; priceZar: number } | null {
  const template = cloneSnapshotTemplate(plan.booking_snapshot_template);
  if (!template?.locked) return null;

  const priceZar = Math.max(1, Math.round(Number(plan.price)));
  const lockedNow = new Date().toISOString();
  const lockExpiresAt = addDaysYmd(occurrenceDateYmd, 120);
  const locked: LockedBooking = {
    ...template.locked,
    date: occurrenceDateYmd,
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

  return { snapshot, locked, priceZar };
}

function isLockedInvoiceStatus(status: string | null): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "sent" || s === "paid" || s === "finalized";
}

/**
 * After admin edits a recurring plan, push template + price to generated occurrence bookings,
 * recompute draft monthly invoices, and refresh cleaner earnings where safe.
 */
export async function propagateRecurringPlanToGeneratedBookings(
  admin: SupabaseClient,
  plan: RecurringPlanRow,
  options?: { reconcileSchedule?: boolean },
): Promise<RecurringPlanPropagationResult> {
  const result: RecurringPlanPropagationResult = {
    ok: true,
    schedule_reconciled: false,
    months_reconciled: 0,
    bookings_cancelled: 0,
    bookings_created: 0,
    bookings_cancel_skipped: 0,
    bookings_cancel_skipped_locked_invoice: 0,
    bookings_cancel_skipped_locked_payout: 0,
    bookings_updated: 0,
    bookings_cleaner_updated: 0,
    bookings_skipped_finalized: 0,
    bookings_skipped_locked_invoice: 0,
    earnings_recomputed: 0,
    earnings_skipped: 0,
    invoices_recomputed: 0,
    errors: [],
  };

  const invoiceIds = new Set<string>();
  const preferredCleanerId = normalizeUuidCandidate(plan.preferred_cleaner_id ?? null);

  if (options?.reconcileSchedule) {
    const reconcile = await reconcileRecurringPlanOccurrences(admin, plan);
    result.schedule_reconciled = true;
    result.months_reconciled = reconcile.months_reconciled;
    result.bookings_cancelled = reconcile.bookings_cancelled;
    result.bookings_created = reconcile.bookings_created;
    result.bookings_cancel_skipped = reconcile.bookings_cancel_skipped;
    result.bookings_cancel_skipped_locked_invoice = reconcile.bookings_cancel_skipped_locked_invoice;
    result.bookings_cancel_skipped_locked_payout = reconcile.bookings_cancel_skipped_locked_payout;
    result.errors.push(...reconcile.errors);
    for (const id of reconcile.invoice_ids) invoiceIds.add(id);
  }

  const { data: rows, error } = await admin
    .from("bookings")
    .select(
      "id, date, status, cleaner_line_earnings_finalized_at, monthly_invoice_id, cleaner_id, payout_owner_cleaner_id, is_team_job, monthly_invoices(status)",
    )
    .eq("recurring_id", plan.id)
    .neq("status", "cancelled");

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const raw of rows ?? []) {
    const row = raw as Record<string, unknown>;
    const booking: GeneratedBookingRow = {
      id: String(row.id ?? ""),
      date: row.date != null ? String(row.date) : null,
      status: row.status != null ? String(row.status) : null,
      cleaner_line_earnings_finalized_at:
        row.cleaner_line_earnings_finalized_at != null ? String(row.cleaner_line_earnings_finalized_at) : null,
      monthly_invoice_id: row.monthly_invoice_id != null ? String(row.monthly_invoice_id) : null,
      cleaner_id: row.cleaner_id != null ? String(row.cleaner_id) : null,
      payout_owner_cleaner_id:
        row.payout_owner_cleaner_id != null ? String(row.payout_owner_cleaner_id) : null,
      is_team_job: row.is_team_job === true,
      invoice_status: null,
    };

    const invJoin = row.monthly_invoices;
    if (invJoin && typeof invJoin === "object" && !Array.isArray(invJoin)) {
      booking.invoice_status = String((invJoin as { status?: unknown }).status ?? "") || null;
    }

    if (booking.monthly_invoice_id && isLockedInvoiceStatus(booking.invoice_status)) {
      result.bookings_skipped_locked_invoice++;
      continue;
    }

    const earningsFinalized = Boolean(booking.cleaner_line_earnings_finalized_at);
    const bookingCompleted = (booking.status ?? "").trim().toLowerCase() === "completed";

    const dateYmd = booking.date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      result.errors.push(`Booking ${booking.id}: invalid date`);
      continue;
    }

    const built = buildOccurrenceSnapshot(plan, dateYmd);
    if (!built) {
      result.errors.push(`Booking ${booking.id}: invalid plan template`);
      continue;
    }

    const { snapshot, locked, priceZar } = built;
    const serviceSlug =
      typeof locked.service === "string" && locked.service.trim()
        ? adminBookingServiceSlug(String(locked.service))
        : "standard";

    const bookingUpdate: Record<string, unknown> = {
      booking_snapshot: snapshot,
      total_paid_zar: priceZar,
      price_snapshot: provisionalPriceSnapshotJson(locked),
      location: locked.location?.trim() || null,
      time: locked.time ?? null,
      service: locked.service != null ? getServiceLabel(locked.service) : null,
      service_slug: serviceSlug,
      rooms: locked.rooms ?? null,
      bathrooms: locked.bathrooms ?? null,
      ...lockedDurationMinutesPatch(locked),
    };

    if (preferredCleanerId) {
      Object.assign(
        bookingUpdate,
        recurringOccurrenceCleanerPatch(preferredCleanerId, {
          operationalStatus: recurringPropagateCleanerOperationalStatus(booking.status),
        }),
      );
    }

    const { error: upErr } = await admin
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", booking.id);

    if (upErr) {
      result.errors.push(`Booking ${booking.id}: ${upErr.message}`);
      continue;
    }

    result.bookings_updated++;
    if (preferredCleanerId) {
      result.bookings_cleaner_updated++;
      await applyRecurringOccurrenceRosterContinuity(admin, {
        bookingId: booking.id,
        recurringId: plan.id,
        leadCleanerId: preferredCleanerId,
      });
    }

    if (booking.monthly_invoice_id) {
      invoiceIds.add(booking.monthly_invoice_id);
    }

    const cleanerId = resolvePersistCleanerIdForBooking({
      cleaner_id: booking.cleaner_id,
      payout_owner_cleaner_id: booking.payout_owner_cleaner_id,
      is_team_job: booking.is_team_job,
    });

    if (!cleanerId) continue;

    const safe = await assertBookingCleanerEarningsResetSafe(admin, booking.id);
    if (!safe.ok) {
      if (earningsFinalized) result.bookings_skipped_finalized++;
      else result.earnings_skipped++;
      continue;
    }

    // Completed rows cannot clear display_earnings (DB check); re-persist from updated total instead.
    if (!bookingCompleted) {
      const reset = await resetBookingCleanerLineEarnings(admin, booking.id);
      if (!reset.ok) {
        result.errors.push(`Booking ${booking.id} earnings reset: ${reset.error}`);
        result.earnings_skipped++;
        continue;
      }
    }

    const persisted = await persistCleanerPayoutIfUnset({
      admin,
      bookingId: booking.id,
      cleanerId,
      forceDisplayRecompute: true,
    });

    if (!persisted.ok) {
      result.errors.push(`Booking ${booking.id} earnings persist: ${persisted.error ?? "failed"}`);
      result.earnings_skipped++;
      continue;
    }

    if (persisted.skipped) {
      if (earningsFinalized) result.bookings_skipped_finalized++;
      else result.earnings_skipped++;
      continue;
    }

    result.earnings_recomputed++;
  }

  for (const invoiceId of await collectDraftInvoiceIdsForRecurringPlan(admin, plan.id)) {
    invoiceIds.add(invoiceId);
  }

  for (const invoiceId of invoiceIds) {
    const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", {
      p_invoice_id: invoiceId,
    });
    if (rpcErr) {
      result.errors.push(`Invoice ${invoiceId}: ${rpcErr.message}`);
      continue;
    }
    result.invoices_recomputed++;

    await syncDraftMonthlyInvoiceToZohoAfterRecompute(admin, invoiceId);
  }

  return result;
}
