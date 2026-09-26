import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { scheduleBookingLifecycleJobs } from "@/lib/booking/bookingLifecycleJobs";
import { syncPreferredCleanerRosterFromBookingRow } from "@/lib/booking/persistPreferredCleaners";
import { promoteV2TeamBookingAfterPayment } from "@/lib/booking/promoteV2TeamBookingAfterPayment";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { startPreferredCleanerDispatchAfterPayment } from "@/lib/dispatch/preferredCleanerDispatch";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

type R0BookingRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  amount_paid_cents?: number | string | null;
  customer_email?: string | null;
  date?: string | null;
  time?: string | null;
  created_at?: string | null;
  paystack_reference?: string | null;
  cleaner_mode?: string | null;
  selected_cleaner_id?: string | null;
  cleaner_id?: string | null;
  assigned_team_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  fulfillment_mode?: string | null;
  booking_snapshot?: unknown;
  booking_priority?: string | null;
  dispatch_attempt_count?: number | null;
  assignment_type?: string | null;
};

export type FinalizeR0BookingPostPaymentResult =
  | {
      ok: true;
      action:
        | "preferred_offer_started"
        | "preferred_offer_already_exists"
        | "auto_assignment_started"
        | "team_promoted"
        | "already_assigned"
        | "ops_assignment_reserved"
        | "no_assignment_needed";
    }
  | { ok: false; error: string };

/**
 * BOOKING-E2E-14B.1
 *
 * Zero-cash settlement is a real paid-booking boundary. After the R0 ledger is
 * durable, converge the operational side effects that positive Paystack
 * finalization would normally start: lifecycle jobs, team promotion, preferred
 * cleaner offer, or automatic assignment.
 *
 * This helper never writes collected-cash columns, never settles Cleaning
 * Credit, and never touches referral/promotion accounting.
 *
 * Replay safety:
 * - lifecycle jobs are unique by booking/job type,
 * - existing team/cleaner assignment is a no-op,
 * - an existing dispatch offer prevents a second preferred offer,
 * - assignBestCleaner is idempotent for already-assigned bookings.
 */
export async function finalizeR0BookingPostPayment(
  admin: SupabaseClient,
  bookingId: string,
): Promise<FinalizeR0BookingPostPaymentResult> {
  const id = String(bookingId ?? "").trim();
  if (!id) return { ok: false, error: "missing_booking_id" };

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  const { data, error } = await admin
    .from("bookings")
    .select(
      [
        "id",
        "status",
        "payment_status",
        "payment_completed_at",
        "amount_paid_cents",
        ownershipColumn,
        "customer_email",
        "date",
        "time",
        "created_at",
        "paystack_reference",
        "cleaner_mode",
        "selected_cleaner_id",
        "cleaner_id",
        "assigned_team_id",
        "team_id",
        "is_team_job",
        "fulfillment_mode",
        "booking_snapshot",
        "booking_priority",
        "dispatch_attempt_count",
        "assignment_type",
      ].join(", "),
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const row = data as unknown as R0BookingRow;
  const paymentStatus = String(row.payment_status ?? "").trim().toLowerCase();
  const paidCents = Number(row.amount_paid_cents ?? 0);
  if (paymentStatus !== "success" || !row.payment_completed_at || !Number.isFinite(paidCents) || paidCents !== 0) {
    return { ok: false, error: "booking_not_settled_r0" };
  }

  const customerId = String((row as Record<string, unknown>)[ownershipColumn] ?? "").trim() || null;
  const customerEmail = String(row.customer_email ?? "").trim();
  const paystackReference = String(row.paystack_reference ?? "").trim() || `r0:${id}`;

  await cancelUnsentBookingPaymentRecoveryJobs(admin, id, "r0_settlement_completed");

  const lifecycle = await scheduleBookingLifecycleJobs(admin, {
    bookingId: id,
    userId: customerId,
    customerEmail,
    amountCents: 0,
    paystackReference,
    appointmentDateYmd: row.date ?? null,
    appointmentTimeHm: row.time ?? null,
  });
  if (!lifecycle.ok) {
    await reportOperationalIssue(
      "warn",
      "finalizeR0BookingPostPayment",
      "R0 lifecycle job scheduling reported a partial failure.",
      { bookingId: id },
    );
  }

  const teamPromotion = await promoteV2TeamBookingAfterPayment(admin, id);
  if (!teamPromotion.ok) {
    await reportOperationalIssue(
      "warn",
      "finalizeR0BookingPostPayment",
      `R0 team promotion failed: ${teamPromotion.error}`,
      { bookingId: id },
    );
    return { ok: false, error: `team_promotion_failed:${teamPromotion.error}` };
  }
  if (teamPromotion.assigned || row.is_team_job === true || String(row.team_id ?? "").trim()) {
    return { ok: true, action: "team_promoted" };
  }

  const roster = await syncPreferredCleanerRosterFromBookingRow(
    admin,
    id,
    {
      booking_snapshot: row.booking_snapshot,
      selected_cleaner_id: row.selected_cleaner_id ?? null,
    },
    "booking_v2_r0",
  );
  if (!roster.ok) {
    await reportOperationalIssue(
      "warn",
      "finalizeR0BookingPostPayment",
      `R0 preferred-cleaner roster sync failed: ${roster.error}`,
      { bookingId: id },
    );
  }

  const cleanerId = String(row.cleaner_id ?? "").trim();
  if (cleanerId) {
    return { ok: true, action: "already_assigned" };
  }

  const cleanerMode = String(row.cleaner_mode ?? "").trim().toLowerCase();
  const selectedCleanerId = String(row.selected_cleaner_id ?? "").trim();
  if (cleanerMode !== "team" && selectedCleanerId) {
    const { count: priorOfferCount, error: offerReadError } = await admin
      .from("dispatch_offers")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", id)
      .eq("cleaner_id", selectedCleanerId);

    if (offerReadError) {
      return { ok: false, error: `dispatch_offer_read_failed:${offerReadError.message}` };
    }
    if ((priorOfferCount ?? 0) > 0) {
      return { ok: true, action: "preferred_offer_already_exists" };
    }

    const dispatch = await startPreferredCleanerDispatchAfterPayment(admin, {
      bookingId: id,
      preferredCleanerId: selectedCleanerId,
      dateYmd: String(row.date ?? "").trim().slice(0, 10),
      timeHm: String(row.time ?? "").trim().slice(0, 5),
      bookingPriority: row.booking_priority ?? null,
      paystackReference,
      dispatchAttemptCount:
        typeof row.dispatch_attempt_count === "number" && Number.isFinite(row.dispatch_attempt_count)
          ? row.dispatch_attempt_count
          : 0,
    });

    if (dispatch.kind === "offer_failed") {
      return { ok: false, error: `preferred_dispatch_failed:${dispatch.error}` };
    }
    return { ok: true, action: "preferred_offer_started" };
  }

  if (cleanerMode === "team" && String(row.assigned_team_id ?? "").trim()) {
    // Team checkout already owns its selected team. Promotion above is the only
    // allowed assignment path; do not fall through to individual auto-dispatch.
    return { ok: true, action: "no_assignment_needed" };
  }

  if (String(row.fulfillment_mode ?? "").trim().toLowerCase() === "ops_assignment") {
    return { ok: true, action: "ops_assignment_reserved" };
  }

  if (process.env.AUTO_DISPATCH_CLEANERS === "false") {
    return { ok: true, action: "no_assignment_needed" };
  }

  const assigned = await assignBestCleaner(admin, id, { source: "booking_v2_r0" });
  if (!assigned.ok) {
    await reportOperationalIssue(
      "warn",
      "finalizeR0BookingPostPayment",
      assigned.message ?? assigned.error ?? "R0 auto-assignment failed.",
      { bookingId: id },
    );
    return { ok: false, error: assigned.message ?? assigned.error ?? "auto_assignment_failed" };
  }

  if (!(assigned as { noOp?: boolean }).noOp) {
    await admin
      .from("bookings")
      .update({ assignment_type: "auto_dispatch" })
      .eq("id", id)
      .is("assignment_type", null);

    if (assigned.assignmentKind === "individual") {
      await notifyCleanerAssignedBooking(admin, id, assigned.cleanerId);
    }
  }

  return { ok: true, action: "auto_assignment_started" };
}
