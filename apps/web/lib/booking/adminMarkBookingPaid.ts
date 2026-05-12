import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { learnFromPaymentSuccess } from "@/lib/ai-autonomy/learningLoop";
import { ensureBookingAssignedStatusInvariant } from "@/lib/admin/adminBookingPostCreatePipeline";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { recordConversionExperimentResultsOnPayment } from "@/lib/conversion/conversionExperimentOutcomes";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { attributePaidBookingToGrowthOutcomes } from "@/lib/growth/growthActionOutcomes";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { logPostBookingGrowthDecision } from "@/lib/growth/postBookingGrowthHint";
import { syncUserPrimaryCityFromBooking } from "@/lib/growth/syncPrimaryCity";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { metrics } from "@/lib/metrics/counters";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolvePersistCleanerIdForBooking, type BookingPersistIdsRow } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { processCustomerReferralAfterFirstPaidBooking } from "@/lib/referrals/server";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { notifyCleanerBookingPaid } from "@/lib/notifications/notifyCleanerBookingPaid";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";

export type AdminMarkPaidMethod = "cash" | "zoho" | "eft";

function buildAutoAssignmentPatch(
  autoAssignmentTag: "auto_dispatch" | "auto_fallback",
  selectionInvalidatedCleaner: boolean,
  pickedCleanerUuid: string | null,
  fallbackReasonCode: string | null,
): { assignment_type: string; fallback_reason?: string; attempted_cleaner_id?: string } {
  const patch: { assignment_type: string; fallback_reason?: string; attempted_cleaner_id?: string } = {
    assignment_type: autoAssignmentTag,
  };
  if (autoAssignmentTag === "auto_fallback" && selectionInvalidatedCleaner && pickedCleanerUuid && fallbackReasonCode) {
    patch.fallback_reason = fallbackReasonCode;
    patch.attempted_cleaner_id = pickedCleanerUuid;
  }
  return patch;
}

function resolveMarkPaidAmountCents(row: {
  total_price?: number | string | null;
  total_paid_cents?: number | string | null;
}): number | null {
  const tpRaw = row.total_price;
  const tp = typeof tpRaw === "number" ? tpRaw : typeof tpRaw === "string" ? Number(tpRaw) : NaN;
  if (Number.isFinite(tp) && tp > 0) {
    return Math.max(0, Math.round(tp * 100));
  }
  const tpc = Number(row.total_paid_cents);
  if (Number.isFinite(tpc) && tpc > 0) {
    return Math.max(0, Math.round(tpc));
  }
  return null;
}

/**
 * Synthetic **settlement marker** (e.g. `cash_<id>`, `eft_<safe>`, `zoho_<safe>`) used to:
 *   - tag the `booking.payment_succeeded` admin event with a stable per-settlement key,
 *     so the canonical event idempotencyKey does not collide with future Paystack webhook
 *     events for the same booking,
 *   - populate `settlement.paystack_reference` in the route response (backward-compat field).
 *
 * **M-2 (May 2026)**: this value is **NEVER written to `bookings.paystack_reference`** anymore.
 * The DB column is preserved as set at insert time (real `pay_<uuid>` for Paystack-initialized
 * rows, `adm_mi_<uuid>` for admin-monthly rows) so a late Paystack webhook can still match
 * the row by its original reference.
 */
function buildExternalPaystackReference(method: AdminMarkPaidMethod, bookingId: string, reference?: string | null): string {
  if (method === "cash") {
    return `cash_${bookingId}`;
  }
  const raw = (reference != null && String(reference).trim() ? String(reference).trim() : bookingId).replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const safe = raw.length > 0 ? raw.slice(0, 120) : bookingId;
  if (method === "eft") {
    return `eft_${safe}`;
  }
  return `zoho_${safe}`;
}

async function runCheckoutLikeAutoDispatchAfterPaid(admin: SupabaseClient, bookingId: string): Promise<void> {
  const dispatchClaimed = await tryClaimNotificationDedupe(admin, "dispatch_admin_mark_paid", { bookingId });
  if (!dispatchClaimed) {
    return;
  }

  const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  const offerAssignFallback = process.env.CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK === "true";
  const autoAssignmentTag = "auto_dispatch" as const;
  const selectionInvalidatedCleaner = false;
  const pickedCleanerUuid: string | null = null;
  const checkoutFallbackReason: string | null = null;

  if (autoDispatch) {
    const r = await assignBestCleaner(admin, bookingId, {
      source: "admin_mark_paid",
    });
    const freshAuto = r.ok && !(r as { noOp?: boolean }).noOp;
    if (freshAuto) {
      await admin
        .from("bookings")
        .update(
          buildAutoAssignmentPatch(
            autoAssignmentTag,
            selectionInvalidatedCleaner,
            pickedCleanerUuid,
            checkoutFallbackReason,
          ),
        )
        .eq("id", bookingId)
        .is("assignment_type", null);
      if (r.assignmentKind === "individual") {
        await notifyCleanerAssignedBooking(admin, bookingId, r.cleanerId);
      }
      metrics.increment("booking.checkout_assignment", {
        assignment_type: autoAssignmentTag,
        bookingId,
        selected_cleaner_id: null,
        assigned_cleaner_id: r.assignmentKind === "individual" ? r.cleanerId : null,
        assigned_team_id: r.assignmentKind === "team" ? r.teamId : null,
      });
    } else if (!r.ok && offerAssignFallback) {
      const smart = await runAdminAssignSmart(admin, {
        bookingId,
        force: false,
        maxAttempts: 25,
        cleanerIds: null,
        autoEscalateExtremeSla: null,
      });
      if (smart.ok) {
        await admin
          .from("bookings")
          .update(
            buildAutoAssignmentPatch(
              autoAssignmentTag,
              selectionInvalidatedCleaner,
              pickedCleanerUuid,
              checkoutFallbackReason,
            ),
          )
          .eq("id", bookingId)
          .is("assignment_type", null);
        await notifyCleanerAssignedBooking(admin, bookingId, smart.cleanerId);
        metrics.increment("booking.checkout_assignment", {
          assignment_type: autoAssignmentTag,
          bookingId,
          selected_cleaner_id: null,
          assigned_cleaner_id: smart.cleanerId,
        });
      }
    }
  } else if (offerAssignFallback) {
    const smart = await runAdminAssignSmart(admin, {
      bookingId,
      force: false,
      maxAttempts: 25,
      cleanerIds: null,
      autoEscalateExtremeSla: null,
    });
    if (smart.ok) {
      await admin
        .from("bookings")
        .update(
          buildAutoAssignmentPatch(
            autoAssignmentTag,
            selectionInvalidatedCleaner,
            pickedCleanerUuid,
            checkoutFallbackReason,
          ),
        )
        .eq("id", bookingId)
        .is("assignment_type", null);
      await notifyCleanerAssignedBooking(admin, bookingId, smart.cleanerId);
      metrics.increment("booking.checkout_assignment", {
        assignment_type: autoAssignmentTag,
        bookingId,
        selected_cleaner_id: null,
        assigned_cleaner_id: smart.cleanerId,
      });
    }
  }
}

export type AdminMarkBookingPaidResult =
  | { ok: true; skipped: true; reason: "already_paid" }
  | {
      ok: true;
      marked_paid: true;
      settlement: {
        amount_cents: number;
        total_paid_zar: number;
        method: AdminMarkPaidMethod;
        payment_reference_external: string | null;
        /**
         * Synthetic **settlement marker** (`cash_<id>`, `eft_<safe>`, `zoho_<safe>`).
         *
         * **NOT** the value persisted in `bookings.paystack_reference` — see M-2 below. Field name and
         * value pattern are preserved for backward compatibility with the admin mark-paid route response,
         * the canonical `booking.payment_succeeded` event idempotency key, and existing fixtures.
         */
        paystack_reference: string;
        /**
         * The actual `bookings.paystack_reference` value as preserved on the DB row after mark-paid
         * (M-2). Equal to the original Paystack reference set at booking creation
         * (`pay_<uuid>` / `adm_mi_<uuid>` / legacy UUID-as-reference). Surfaced for ops/audit
         * tooling that needs to reconcile off-platform settlements with Paystack metadata.
         */
        preserved_paystack_reference: string | null;
      };
    }
  | { ok: false; error: string; httpStatus: number };

/**
 * Marks a booking paid off-platform (cash / Zoho / EFT), mirroring Paystack success writes plus
 * `recordBookingSideEffects`, checkout-like auto-dispatch, and the same post-payment analytics hooks as
 * {@link upsertBookingFromPaystack}.
 *
 * **M-2 (May 2026): paystack_reference preservation.**
 * Off-platform settlement no longer overwrites `bookings.paystack_reference`. The original Paystack
 * reference (set when the row was inserted by `processPaystackInitializeBody` /
 * `insertPendingPaymentBookingRow`, or by the admin monthly path) stays put so a late Paystack
 * webhook can still find this booking by `paystack_reference` and follow the existing
 * idempotent skip-finalize path (`upsertBookingFromPaystack` returns `skipped_already_persisted`
 * when `status !== "pending_payment"`).
 *
 * Off-platform traceability is recorded via `payment_method` (cash | zoho | eft | card) and
 * `payment_reference_external` (Zoho invoice id, EFT memo, etc., from migration 20260849), with
 * the synthetic marker (`cash_<id>` / `eft_<safe>` / `zoho_<safe>`) only used for the event
 * idempotencyKey + response field — never for the DB column. Migration 20260850 already
 * backfilled legacy rows where `paystack_reference` was clobbered with the synthetic prefix
 * into `payment_method` + `payment_reference_external`.
 */
export async function adminMarkBookingPaid(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    method: AdminMarkPaidMethod;
    reference?: string | null;
    /** When set and positive, overrides DB-derived amount (still validated against row totals in route if desired). */
    amountCentsOverride?: number | null;
    /** Supabase Auth user id of the admin performing mark-paid (audit). */
    adminUserId: string;
  },
): Promise<AdminMarkBookingPaidResult> {
  const { bookingId, method, reference, amountCentsOverride, adminUserId } = params;

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, payment_completed_at, customer_email, user_id, created_at, booking_snapshot, date, time, city_id, total_price, total_paid_cents, amount_paid_cents, cleaner_id, selected_cleaner_id, payout_owner_cleaner_id, is_team_job, paystack_reference, dispatch_status, assignment_type, payment_mismatch",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !row) {
    return { ok: false, error: loadErr?.message ?? "Booking not found.", httpStatus: 404 };
  }

  const b = row as {
    status?: string | null;
    payment_completed_at?: string | null;
    customer_email?: string | null;
    user_id?: string | null;
    created_at?: string | null;
    booking_snapshot?: unknown;
    date?: string | null;
    time?: string | null;
    city_id?: string | null;
    total_price?: number | string | null;
    total_paid_cents?: number | null;
    amount_paid_cents?: number | null;
    cleaner_id?: string | null;
    selected_cleaner_id?: string | null;
    paystack_reference?: string | null;
  };

  /**
   * M-2: capture the existing `paystack_reference` BEFORE we touch the row so we can:
   *   - confirm the patch never overwrites it (asserted by the M-2 regression test),
   *   - feed the real reference (not the synthetic marker) into post-success side effects
   *     such as `user_events.payload.paystack_reference` and lifecycle job audit metadata,
   *     keeping admin mark-paid analytics consistent with Paystack-success rows.
   */
  const preservedPaystackReference =
    typeof b.paystack_reference === "string" && b.paystack_reference.trim()
      ? b.paystack_reference.trim()
      : null;

  if (b.payment_completed_at != null && String(b.payment_completed_at).trim() !== "") {
    return { ok: true, skipped: true, reason: "already_paid" };
  }

  const st = String(b.status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") {
    return { ok: false, error: "Cannot mark paid: booking is cancelled or failed.", httpStatus: 400 };
  }

  let amountCents: number | null =
    amountCentsOverride != null && Number.isFinite(Number(amountCentsOverride)) && Number(amountCentsOverride) > 0
      ? Math.max(0, Math.round(Number(amountCentsOverride)))
      : null;
  if (amountCents == null) {
    amountCents = resolveMarkPaidAmountCents(b);
  }
  if (amountCents == null || amountCents <= 0) {
    return {
      ok: false,
      error: "Could not resolve payment amount (set total_price / total_paid_cents on the booking or pass amount_cents).",
      httpStatus: 400,
    };
  }

  if (b.total_price != null && String(b.total_price).trim() !== "") {
    const tpRaw = b.total_price;
    const tpNum = typeof tpRaw === "number" ? tpRaw : Number(String(tpRaw).trim());
    if (Number.isFinite(tpNum) && tpNum > 0 && amountCents > 0) {
      const expected = Math.max(0, Math.round(tpNum * 100));
      if (amountCents !== expected) {
        console.warn("ADMIN_AMOUNT_OVERRIDE", {
          bookingId,
          expected,
          provided: amountCents,
        });
      }
    }
  }

  const paidMoment = new Date().toISOString();
  const externalRef = buildExternalPaystackReference(method, bookingId, reference);
  const refExternalTrim =
    reference != null && String(reference).trim() ? String(reference).trim().slice(0, 500) : null;

  const hasCleanerRef =
    (typeof b.cleaner_id === "string" && /^[0-9a-f-]{36}$/i.test(b.cleaner_id.trim())) ||
    (typeof b.selected_cleaner_id === "string" && /^[0-9a-f-]{36}$/i.test(b.selected_cleaner_id.trim()));

  const hadPaymentMismatch = Boolean((b as { payment_mismatch?: boolean | null }).payment_mismatch);
  const quoteCents = resolveMarkPaidAmountCents(b);

  /**
   * M-2: `paystack_reference` is intentionally **omitted** from this patch so the existing
   * value (real `pay_<uuid>` / `adm_mi_<uuid>` / legacy UUID) survives off-platform settlement.
   * Off-platform traceability is captured via `payment_method` + `payment_reference_external`.
   */
  const patch: Record<string, unknown> = {
    amount_paid_cents: amountCents,
    total_paid_cents: amountCents,
    total_paid_zar: Math.round(amountCents / 100),
    payment_completed_at: paidMoment,
    payment_status: "success",
    paid_at: paidMoment,
    marked_paid_by_admin_id: adminUserId.trim() || null,
    payment_method: method,
    payment_reference_external: refExternalTrim,
  };

  if (hadPaymentMismatch && quoteCents != null && amountCents >= quoteCents) {
    patch.payment_mismatch = false;
    void logSystemEvent({
      level: "info",
      source: "PAYMENT_MISMATCH_RESOLVED",
      message: "collected_amount_covers_current_quote",
      context: { bookingId, collected_cents: amountCents, quote_cents: quoteCents },
    });
  }

  if (st === "pending_payment") {
    patch.status = hasCleanerRef ? "assigned" : "pending";
    patch.dispatch_status = hasCleanerRef ? "assigned" : "searching";
  }

  const { data: updatedRows, error: upErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .is("payment_completed_at", null)
    .not("status", "eq", "cancelled")
    .not("status", "eq", "failed")
    .select("id");

  if (upErr) {
    await reportOperationalIssue("error", "adminMarkBookingPaid", upErr.message, { bookingId });
    return { ok: false, error: upErr.message, httpStatus: 500 };
  }

  const updated = Array.isArray(updatedRows) && updatedRows.length === 1 ? (updatedRows[0] as { id: string }) : null;

  if (!updated) {
    const { data: again } = await admin.from("bookings").select("payment_completed_at").eq("id", bookingId).maybeSingle();
    const paidAgain = again as { payment_completed_at?: string | null } | null;
    if (paidAgain?.payment_completed_at != null && String(paidAgain.payment_completed_at).trim() !== "") {
      return { ok: true, skipped: true, reason: "already_paid" };
    }
    return { ok: false, error: "Mark as paid did not apply (booking state may have changed).", httpStatus: 409 };
  }

  await ensureBookingAssignedStatusInvariant(admin, bookingId);
  await runCheckoutLikeAutoDispatchAfterPaid(admin, bookingId);

  const emailStored = normalizeEmail(typeof b.customer_email === "string" ? b.customer_email : "");
  const userIdForEffects = typeof b.user_id === "string" && b.user_id.trim() ? b.user_id.trim() : null;
  const createdAt = typeof b.created_at === "string" && b.created_at.trim() ? b.created_at.trim() : paidMoment;
  const locked =
    b.booking_snapshot && typeof b.booking_snapshot === "object" && !Array.isArray(b.booking_snapshot)
      ? (b.booking_snapshot as { locked?: { date?: string | null; time?: string | null } }).locked
      : undefined;

  try {
    await recordBookingSideEffects({
      supabase: admin,
      bookingId,
      userId: userIdForEffects,
      customerEmail: emailStored,
      amountCents,
      // M-2: prefer the preserved real Paystack reference for `user_events` /
      // `scheduleBookingLifecycleJobs` audit metadata so admin mark-paid rows match the
      // value still stored on `bookings.paystack_reference`. Fall back to the synthetic
      // settlement marker only when the row has no preserved reference (very legacy data).
      paystackReference: preservedPaystackReference ?? externalRef,
      createdAt,
      appointmentDateYmd: b.date ?? locked?.date ?? null,
      appointmentTimeHm: b.time ?? locked?.time ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", "adminMarkBookingPaid", `recordBookingSideEffects threw: ${msg}`, {
      bookingId,
    });
  }

  const cityId = typeof b.city_id === "string" && b.city_id.trim() ? b.city_id.trim() : null;
  void syncUserPrimaryCityFromBooking(admin, userIdForEffects, cityId);
  void processCustomerReferralAfterFirstPaidBooking({
    admin,
    bookingUserId: userIdForEffects,
    customerEmail: emailStored,
    bookingId,
  });
  void attributePaidBookingToGrowthOutcomes({
    admin,
    userId: userIdForEffects,
    bookingId,
    amountCents,
    paidAtIso: paidMoment,
  });
  void recordConversionExperimentResultsOnPayment(admin, {
    bookingId,
    userId: userIdForEffects,
    revenueCents: amountCents,
    paidAtIso: paidMoment,
  });
  void learnFromPaymentSuccess(admin, { userId: userIdForEffects, bookingId, amountCents });

  if (userIdForEffects) {
    const uid = userIdForEffects;
    void (async () => {
      try {
        const ctx = await loadCustomerGrowthContext(admin, uid);
        if (ctx) await persistCustomerSegmentRow(admin, ctx);
        await logPostBookingGrowthDecision(admin, uid);
      } catch {
        /* non-fatal */
      }
    })();
  }

  const { data: persistRow } = await admin
    .from("bookings")
    .select("cleaner_id, payout_owner_cleaner_id, is_team_job, total_paid_cents, amount_paid_cents")
    .eq("id", bookingId)
    .maybeSingle();
  const persistCleanerId = persistRow
    ? resolvePersistCleanerIdForBooking(persistRow as BookingPersistIdsRow)
    : null;
  const prRow = persistRow as { total_paid_cents?: unknown; amount_paid_cents?: unknown } | null;
  const tpcPersist = Number(prRow?.total_paid_cents);
  const apcPersist = Number(prRow?.amount_paid_cents);
  const centsCoherent =
    Number.isFinite(tpcPersist) &&
    tpcPersist > 0 &&
    Number.isFinite(apcPersist) &&
    apcPersist > 0;
  if (persistCleanerId && centsCoherent) {
    const pr = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId: persistCleanerId });
    if (!pr.ok) {
      void reportOperationalIssue("warn", "adminMarkBookingPaid", pr.error ?? "persistCleanerPayoutIfUnset failed", {
        bookingId,
        cleanerId: persistCleanerId,
      });
    }
  } else if (persistCleanerId && !centsCoherent) {
    void reportOperationalIssue("warn", "adminMarkBookingPaid", "skip_persist_non_positive_amounts", {
      bookingId,
      cleanerId: persistCleanerId,
      total_paid_cents: prRow?.total_paid_cents,
      amount_paid_cents: prRow?.amount_paid_cents,
    });
  }

  const { data: notifyRow } = await admin.from("bookings").select("cleaner_id").eq("id", bookingId).maybeSingle();
  const notifyCleanerId =
    notifyRow && typeof notifyRow === "object" ? String((notifyRow as { cleaner_id?: string | null }).cleaner_id ?? "").trim() : "";
  if (/^[0-9a-f-]{36}$/i.test(notifyCleanerId)) {
    void notifyCleanerBookingPaid({
      admin,
      bookingId,
      cleanerId: notifyCleanerId,
      method,
      externalReference: refExternalTrim,
    });
  }

  return {
    ok: true,
    marked_paid: true,
    settlement: {
      amount_cents: amountCents,
      total_paid_zar: Math.round(amountCents / 100),
      method,
      payment_reference_external: refExternalTrim,
      // M-2: synthetic settlement marker (cash_/eft_/zoho_), retained for backward compat
      // with the canonical event idempotencyKey + admin mark-paid route response. Not the
      // value on `bookings.paystack_reference` (see `preserved_paystack_reference` below).
      paystack_reference: externalRef,
      preserved_paystack_reference: preservedPaystackReference,
    },
  };
}

export type AdminRecordDepositResult =
  | { ok: true; deposit_paid_cents: number }
  | { ok: false; error: string; httpStatus: number };

/**
 * Records or updates a deposit amount without marking the booking fully paid (no payment_completed_at).
 * Does not run Paystack success side effects or payout hooks.
 */
export async function adminRecordBookingDeposit(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    depositCents: number;
    method: AdminMarkPaidMethod;
    reference?: string | null;
    reason: string;
    adminUserId: string;
  },
): Promise<AdminRecordDepositResult> {
  const { bookingId, depositCents, method, reference, reason, adminUserId } = params;
  const cents = Math.round(Number(depositCents));
  if (!Number.isFinite(cents) || cents <= 0) {
    return { ok: false, error: "deposit_cents must be a positive integer.", httpStatus: 400 };
  }
  const reasonTrim = String(reason ?? "").trim();
  if (reasonTrim.length < 2) {
    return { ok: false, error: "Enter a short reason (at least 2 characters).", httpStatus: 400 };
  }

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select("id, status, payment_completed_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !row) {
    return { ok: false, error: loadErr?.message ?? "Booking not found.", httpStatus: 404 };
  }

  const st = String((row as { status?: string | null }).status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") {
    return { ok: false, error: "Cannot record deposit: booking is cancelled or failed.", httpStatus: 400 };
  }

  const paidAt = (row as { payment_completed_at?: string | null }).payment_completed_at;
  if (paidAt != null && String(paidAt).trim() !== "") {
    return {
      ok: false,
      error: "Booking is already fully marked paid. Deposit can only be recorded before full settlement.",
      httpStatus: 400,
    };
  }

  const refTrim = reference != null && String(reference).trim() ? String(reference).trim().slice(0, 500) : null;

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      deposit_paid_cents: cents,
    })
    .eq("id", bookingId)
    .is("payment_completed_at", null);

  if (upErr) {
    await reportOperationalIssue("error", "adminRecordBookingDeposit", upErr.message, { bookingId });
    return { ok: false, error: upErr.message, httpStatus: 500 };
  }

  void logSystemEvent({
    level: "info",
    source: "ADMIN_BOOKING_DEPOSIT",
    message: "deposit_recorded",
    context: {
      bookingId,
      deposit_cents: cents,
      method,
      reference: refTrim,
      reason: reasonTrim.slice(0, 500),
      admin_user_id: adminUserId.trim() || null,
    },
  });

  return { ok: true, deposit_paid_cents: cents };
}
