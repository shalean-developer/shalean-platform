import { syncPreferredCleanerRosterFromBookingRow } from "@/lib/booking/persistPreferredCleaners";
import { resolveCustomerPhoneFromAuthAdmin } from "@/lib/admin/adminBookingCustomerContact";
import { bookingCustomerKey, bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import type { CheckoutPriceSnapshotV1 } from "@/lib/booking/priceSnapshotBooking";
import {
  checkoutPriceSnapshotFromLegacyPriceSnapshotV1,
  parseCheckoutPriceSnapshotV1FromMeta,
} from "@/lib/booking/priceSnapshotBooking";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { resolveBookingLocationContext, type BookingLocationSource } from "@/lib/booking/resolveLocationId";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import {
  bookingPaystackFinalizeTraceEnabled,
  bookingPaystackMetadataDebugEnabled,
} from "@/lib/logging/bookingPaymentDebug";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { cancelUnsentBookingPaymentRecoveryJobs } from "@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import {
  finalizePendingPaymentBookingFromPaystack,
  insertFinalizedBookingFromPaystack,
  type PaymentFinalizationPersistedBookingRow,
} from "@/lib/booking/paymentFinalizationBookingCommands";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getDemandSupplySnapshotByCity, getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { recurringOccurrenceCleanerPatch } from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import { promoteV2TeamBookingAfterPayment } from "@/lib/booking/promoteV2TeamBookingAfterPayment";
import { learnFromPaymentSuccess } from "@/lib/ai-autonomy/learningLoop";
import { recordConversionExperimentResultsOnPayment } from "@/lib/conversion/conversionExperimentOutcomes";
import { attributePaidBookingToGrowthOutcomes } from "@/lib/growth/growthActionOutcomes";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { logPostBookingGrowthDecision } from "@/lib/growth/postBookingGrowthHint";
import { syncUserPrimaryCityFromBooking } from "@/lib/growth/syncPrimaryCity";
import { createPendingCustomerReferral, processCustomerReferralAfterFirstPaidBooking } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkoutPaidDispatchOfferCleanerId,
  resolveCheckoutCleanerSelection,
} from "@/lib/booking/checkoutCleanerEligibility";
import { paymentConversionBucketFromSeconds } from "@/lib/booking/paymentConversionBucket";
import { resolveExtrasLineItems } from "@/lib/booking/extrasSnapshot";
import {
  buildLegacyLockDurationPersistPatch,
  authoritativeDurationPatchFromBookingRow,
} from "@/lib/booking/quote/bookingQuotePersistence";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import {
  roomsBathroomsCountsFromServiceDetails,
  serviceLabelFromBookingRow,
} from "@/lib/booking/bookingV2CustomerDisplay";
import { resolvePaymentAttributionTouches } from "@/lib/pay/paymentLinkDeliveryEvents";
import { escalateFailedCheckoutDispatchOffer } from "@/lib/booking/checkoutDispatchOfferFailureEscalation";
import { dispatchFallbackAfterSelectedCleanerOfferInsertFailure } from "@/lib/booking/checkoutDispatchOfferFailureFallback";
import { startPreferredCleanerDispatchAfterPayment } from "@/lib/dispatch/preferredCleanerDispatch";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { metrics } from "@/lib/metrics/counters";
import {
  mergePickedCleanerWithPersistedBookingSelection,
  normalizeUuidCandidate,
  paystackFinalizeClearsSelectedCleanerId,
  pickUserSelectedCleanerId,
} from "@/lib/booking/userSelectedCleanerFromSnapshot";
import { resolvePersistCleanerIdForBooking, type BookingPersistIdsRow } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resolveTenureBasedCleanerShareForBookingRow } from "@/lib/payout/tenureBasedCleanerLineShare";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { recordSystemMetric } from "@/lib/observability/recordSystemMetric";
import {
  isInlineDecoupledPaystackReference,
  resolveInternalBookingIdFromPaystackReference,
} from "@/lib/booking/paystackBookingIdLookup";

/**
 * `payment_status='success'` is the single signal `bookingPayableForWeeklyBatch` (prepaid path) keys off.
 * Monthly-managed rows (recurring/monthly customers) keep their own lifecycle states
 * (`pending_monthly` → `success` set by `applyMonthlyInvoicePayment`) and must NOT be flipped
 * to `success` by Paystack one-off finalize.
 *
 * Sources of truth, in order:
 *   1. Already-persisted `bookings` columns (existing row): `is_monthly_billing_booking`,
 *      `billing_type ∈ {recurring_invoice, monthly_contract}`, `monthly_invoice_id`,
 *      `payment_status='pending_monthly'`.
 *   2. Resolved `user_profiles.billing_type='monthly'` (no-existing-row insert path; the DB
 *      `bookings_after_write_monthly_invoice` trigger respects `success` once set, so we must guard here).
 */
export async function detectMonthlyManagedRowForPaystackFinalize(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  existing: Record<string, unknown> | null,
  userIdResolved: string | null,
): Promise<boolean> {
  if (existing && typeof existing === "object") {
    if ((existing as { is_monthly_billing_booking?: unknown }).is_monthly_billing_booking === true) return true;
    const bt = String((existing as { billing_type?: unknown }).billing_type ?? "").trim().toLowerCase();
    if (bt === "recurring_invoice" || bt === "monthly_contract") return true;
    const mid = (existing as { monthly_invoice_id?: unknown }).monthly_invoice_id;
    if (mid != null && String(mid).trim() !== "") return true;
    const ps = String((existing as { payment_status?: unknown }).payment_status ?? "").trim().toLowerCase();
    if (ps === "pending_monthly") return true;
  }
  if (supabase && userIdResolved) {
    const { data } = await supabase
      .from("user_profiles")
      .select("billing_type")
      .eq("id", userIdResolved)
      .maybeSingle();
    const bt = String((data as { billing_type?: string } | null)?.billing_type ?? "").trim().toLowerCase();
    if (bt === "monthly") return true;
  }
  return false;
}

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

export type UpsertBookingInput = {
  paystackReference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
  /** Flat Paystack metadata (server-set at initialize) — used only to resolve user_id with snapshot. */
  paystackMetadata?: Record<string, string | undefined> | null;
  paystackAuthorizationCode?: string | null;
  paystackCustomerCode?: string | null;
  paidAtIso?: string | null;
  /** Explicit test-booking override for admin/dev tooling. */
  isTest?: boolean;
  /** Caller (verify / webhook / retry) for structured logs only. */
  paystackPersistSource?: "verify" | "webhook" | "retry";
};

function boolish(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * `metadata.price_snapshot` / `booking` arrive as JSON strings from Paystack;
 * {@link parseCheckoutPriceSnapshotV1FromMeta} unwraps; this keeps a single explicit call site in upsert.
 */
function resolveCheckoutPriceSnapshotFromPaystackMetadata(
  meta: Record<string, string | undefined> | null | undefined,
): CheckoutPriceSnapshotV1 | null {
  return parseCheckoutPriceSnapshotV1FromMeta(meta ?? null);
}

/**
 * Idempotent insert by `paystack_reference`. Webhook is the source of truth for persistence.
 *
 * **Webhook + verify:** Paystack may deliver `charge.success` while the client also calls verify with the
 * same reference. Second invocation loads the row (status is no longer `pending_payment`) and returns
 * `{ skipped: true }` without duplicating inserts, dispatch, or side effects.
 */
export type UpsertBookingFromPaystackResult = {
  ok: boolean;
  skipped: boolean;
  bookingId: string | null;
  error?: string;
  reason?: "amount_mismatch" | "finalization_failed";
  /** Row exists on disk (including mismatch / reconciliation terminal states). */
  bookingInDatabase?: boolean;
  /**
   * True only on the first transition into a terminal payment recovery state for this reference.
   * Verify/webhook use this to enqueue `failed_jobs` once; idempotent replays omit it.
   */
  recoveryEnqueue?: boolean;
};

/**
 * Booking V2 finalize returns only `{ id, created_at, user_id }` from the UPDATE — schedule fields
 * live on the pending row and the patch row built in this module. Without this helper, preferred
 * dispatch reads empty date/time and fails with `invalid_preferred_dispatch_params`.
 */
export function resolvePreferredDispatchScheduleAtPayment(params: {
  finalizeRow: { date?: unknown; time?: unknown };
  pendingRow?: { date?: unknown; time?: unknown } | null;
  lockedRow?: { date?: unknown; time?: unknown } | null;
  bookingSnapshot?: unknown;
}): { dateYmd: string; timeHm: string } {
  const ymd = (raw: unknown): string => {
    const s = raw != null ? String(raw).trim().slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  };
  const hm = (raw: unknown): string => {
    const s = raw != null ? String(raw).trim() : "";
    return s ? s.slice(0, 5) : "";
  };

  let snapDate = "";
  let snapTime = "";
  if (params.bookingSnapshot && typeof params.bookingSnapshot === "object" && !Array.isArray(params.bookingSnapshot)) {
    const snap = params.bookingSnapshot as Record<string, unknown>;
    snapDate = ymd(snap.date);
    snapTime = hm(snap.time);
  }

  const dateYmd =
    ymd(params.finalizeRow.date) ||
    ymd(params.pendingRow?.date) ||
    ymd(params.lockedRow?.date) ||
    snapDate;
  const timeHm =
    hm(params.finalizeRow.time) ||
    hm(params.pendingRow?.time) ||
    hm(params.lockedRow?.time) ||
    snapTime;

  return { dateYmd, timeHm };
}

export async function upsertBookingFromPaystack(input: UpsertBookingInput): Promise<UpsertBookingFromPaystackResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("warn", "upsertBookingFromPaystack", "Supabase admin client not configured", {
      paystackReference: input.paystackReference,
    });
    return { ok: false, skipped: true, bookingId: null, error: "Supabase not configured" };
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(supabase);

  const existingSelect =
    "id, status, is_recurring_generated, price_snapshot, selected_cleaner_id, billing_type, is_monthly_billing_booking, monthly_invoice_id, payment_status, location, date, time, service, service_slug, service_details, selected_extras, pricing_summary, booking_snapshot, rooms, bathrooms, extras, suburb, access_instructions, parking_instructions, gate_code, cleaner_mode, cleaner_count, assigned_team_id, booking_type" as const;

  const { data: existingByRef, error: selectErr } = await supabase
    .from("bookings")
    .select(existingSelect)
    .eq("paystack_reference", input.paystackReference)
    .maybeSingle();

  if (selectErr) {
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `select failed: ${selectErr.message}`, {
      paystackReference: input.paystackReference,
    });
    return { ok: false, skipped: true, bookingId: null, error: selectErr.message };
  }

  let existing: typeof existingByRef = existingByRef;
  /**
   * When finalizing `pending_payment`, whether the row was matched by Paystack reference or by
   * internal booking id (legacy `paystack_reference` still equals booking UUID while charge uses `pay_<uuid>`).
   */
  let pendingFinalizeMatch: "paystack_reference" | "id" | null = null;

  if (existing && typeof existing === "object" && "id" in existing) {
    pendingFinalizeMatch = "paystack_reference";
  }

  if (!existing) {
    const internalId = resolveInternalBookingIdFromPaystackReference(
      input.paystackReference,
      input.paystackMetadata ?? null,
    );
    if (internalId) {
      const { data: existingById, error: idSelErr } = await supabase
        .from("bookings")
        .select(existingSelect)
        .eq("id", internalId)
        .maybeSingle();
      if (idSelErr) {
        await reportOperationalIssue("error", "upsertBookingFromPaystack", `select by id failed: ${idSelErr.message}`, {
          paystackReference: input.paystackReference,
        });
        return { ok: false, skipped: true, bookingId: null, error: idSelErr.message };
      }
      if (existingById && typeof existingById === "object" && "id" in existingById) {
        existing = existingById;
        pendingFinalizeMatch = "id";
      }
    }
  }

  let existingPendingPaymentId: string | null = null;
  if (existing && typeof existing === "object" && "id" in existing) {
    const st = String((existing as { status?: string }).status ?? "");
    const bidEarly = String((existing as { id: string }).id);
    if (st === "payment_mismatch") {
      return {
        ok: false,
        skipped: true,
        bookingId: bidEarly,
        reason: "amount_mismatch",
        bookingInDatabase: true,
        error: "amount_mismatch",
      };
    }
    if (st === "payment_reconciliation_required") {
      return {
        ok: false,
        skipped: true,
        bookingId: bidEarly,
        reason: "finalization_failed",
        bookingInDatabase: true,
        error: "finalization_failed",
      };
    }
    if (st !== "pending_payment") {
      logPaymentStructured("payment_finalize", {
        reference: input.paystackReference,
        status: "skipped_already_persisted",
        booking_id: bidEarly,
        source: input.paystackPersistSource ?? null,
      });
      return {
        ok: true,
        skipped: true,
        bookingId: bidEarly,
        bookingInDatabase: true,
      };
    }
    existingPendingPaymentId = bidEarly;
  }

  const locked = input.snapshot?.locked;
  const lockedRow = parseLockedBookingFromUnknown(locked ?? null);
  if (!lockedRow) {
    void reportOperationalIssue("warn", "upsertBookingFromPaystack", "Lock invalid — using snapshot fallback", {
      paystackReference: input.paystackReference,
    });
  }

  if (bookingPaystackMetadataDebugEnabled()) {
    console.log("[UPSERT METADATA RAW]", input.paystackMetadata);
  }

  const priceSnapshotFromMeta = resolveCheckoutPriceSnapshotFromPaystackMetadata(input.paystackMetadata ?? null);

  if (bookingPaystackMetadataDebugEnabled()) {
    console.log("[UPSERT SNAPSHOT PARSED]", priceSnapshotFromMeta);
  }

  const priceSnapshot =
    priceSnapshotFromMeta ??
    (existing && typeof existing === "object" && "price_snapshot" in existing
      ? checkoutPriceSnapshotFromLegacyPriceSnapshotV1((existing as { price_snapshot?: unknown }).price_snapshot)
      : null);
  if (!priceSnapshot) {
    const metaKeys = Object.keys(input.paystackMetadata ?? {});
    logPaymentStructured("payment_finalize", {
      reference: input.paystackReference,
      status: "missing_price_snapshot",
      metadata_key_count: metaKeys.length,
      source: input.paystackPersistSource ?? null,
    });
    throw new Error("Missing price snapshot — cannot safely finalize booking");
  }

  if (bookingPaystackFinalizeTraceEnabled()) {
    console.log("[PRICE SNAPSHOT USED]", {
      reference: input.paystackReference,
      total: priceSnapshot.total_zar,
      source: priceSnapshotFromMeta ? "metadata" : "db_legacy",
    });
  }

  const MISMATCH_EPS_ZAR = 2;
  const paidZar = input.amountCents / 100;
  const expectedZar = priceSnapshotFromMeta
    ? priceSnapshot.total_zar
    : (() => {
        const rawPay = input.paystackMetadata?.pay_total_zar;
        const parsedPay = rawPay != null && String(rawPay).trim() ? Number(String(rawPay).trim()) : NaN;
        if (Number.isFinite(parsedPay) && parsedPay > 0) return parsedPay;
        return priceSnapshot.total_zar;
      })();
    if (Math.abs(paidZar - expectedZar) > MISMATCH_EPS_ZAR) {
    logPaymentStructured("payment_mismatch", {
      reference: input.paystackReference,
      paid_zar: paidZar,
      expected_zar: expectedZar,
      total: priceSnapshot.total_zar,
    });
    void recordSystemMetric({
      metric: "pricing.mismatch",
      value: 1,
      metadata: { reference: input.paystackReference, paid_zar: paidZar, expected_zar: expectedZar },
    });
    const paidAtIso = new Date().toISOString();
    const mismatchPatch = {
      status: "payment_mismatch" as const,
      payment_mismatch: true,
      payment_completed_at: paidAtIso,
      price_snapshot: priceSnapshot as unknown as Record<string, unknown>,
      total_price: priceSnapshot.total_zar,
      total_paid_zar: Math.round(paidZar),
      amount_paid_cents: input.amountCents,
    };
    if (pendingFinalizeMatch === "id" && existingPendingPaymentId) {
      await supabase
        .from("bookings")
        .update(mismatchPatch)
        .eq("id", existingPendingPaymentId)
        .eq("status", "pending_payment");
    } else {
      await supabase
        .from("bookings")
        .update(mismatchPatch)
        .eq("paystack_reference", input.paystackReference)
        .eq("status", "pending_payment");
    }
    void enqueueFailedJob("booking_finalize", {
      paystackReference: input.paystackReference,
      error: "amount_mismatch",
      paidZar,
      expectedZar,
      payload: input.paystackMetadata ?? null,
    });
    return {
      ok: false,
      skipped: true,
      bookingId: existingPendingPaymentId,
      error: "amount_mismatch",
      reason: "amount_mismatch",
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
  }

  const existingPersistedSelectedCleanerId =
    existingPendingPaymentId != null &&
    existing &&
    typeof existing === "object" &&
    "selected_cleaner_id" in existing
      ? (existing as { selected_cleaner_id?: string | null }).selected_cleaner_id
      : undefined;

  /**
   * Finalize precedence for user-selected cleaner:
   * **DB `bookings.selected_cleaner_id`** (flow-intake / initialize) wins when the Paystack snapshot
   * lock omits `cleaner_id`; then snapshot / metadata picks; see {@link mergePickedCleanerWithPersistedBookingSelection}.
   */
  const pickedCleanerUuid = mergePickedCleanerWithPersistedBookingSelection(
    pickUserSelectedCleanerId(lockedRow, input.snapshot),
    existingPersistedSelectedCleanerId,
  );
  const normalizedPickedCleaner = normalizeUuidCandidate(pickedCleanerUuid);
  const checkoutResolution = await resolveCheckoutCleanerSelection(supabase, {
    pickedCleanerUuid,
    locked: lockedRow,
  });
  const userConfirmedCleanerId: string | null =
    checkoutResolution.kind === "honor" ? checkoutResolution.cleanerId : null;
  const selectionInvalidatedCleaner = checkoutResolution.kind === "fallback";
  const checkoutFallbackReason =
    checkoutResolution.kind === "fallback" ? checkoutResolution.reason : null;
  const checkoutIntentRow =
    checkoutResolution.kind === "fallback" && normalizedPickedCleaner == null
      ? { attempted_cleaner_id: checkoutResolution.attemptedId }
      : {};

  const postPayAssignmentClear: Record<string, unknown> =
    userConfirmedCleanerId != null
      ? {}
      : paystackFinalizeClearsSelectedCleanerId({
            userConfirmedCleanerId,
            checkoutResolutionKind: checkoutResolution.kind,
          })
        ? { cleaner_id: null as string | null, selected_cleaner_id: null as string | null }
        : { cleaner_id: null as string | null };

  const price_breakdown: Record<string, unknown> = {
    subtotalZar: priceSnapshot.subtotal_zar,
    extrasZar: priceSnapshot.extras_total_zar,
    discountZar: priceSnapshot.discount_zar,
    visitTotalZar: priceSnapshot.visit_total_zar,
    tipZar: priceSnapshot.tip_zar,
    totalPayableZar: priceSnapshot.total_zar,
    source: "checkout_price_snapshot_v1",
    line_items: priceSnapshot.line_items,
  };
  const total_price = priceSnapshot.total_zar;
  const pricing_version_id =
    priceSnapshot.pricing_version_id ?? lockedRow?.pricing_version_id?.trim() ?? null;

  let extrasSnapshotRaw: { slug: string; name: string; price: number }[] = [];
  if (lockedRow) {
    extrasSnapshotRaw = resolveExtrasLineItems({
      extras: lockedRow.extras ?? [],
      extras_line_items: lockedRow.extras_line_items,
      service: lockedRow.service ?? null,
    }).map(({ slug, name, price }) => ({ slug, name, price }));
  } else if (Array.isArray(locked?.extras_line_items) && locked.extras_line_items.length > 0) {
    extrasSnapshotRaw = locked.extras_line_items.map(({ slug, name, price }) => ({ slug, name, price }));
  }
  const extrasSnapshot = sanitizeBookingExtrasForPersist(extrasSnapshotRaw, {
    where: "upsertBookingFromPaystack",
    bookingId: existingPendingPaymentId ?? undefined,
  });
  const cust = input.snapshot?.customer;
  const emailStored = normalizeEmail(input.customerEmail);
  const userIdResolved = await resolveBookingUserId(
    supabase,
    input.snapshot,
    input.paystackMetadata ?? null,
    emailStored,
  );
  let customerPhone = cust?.phone?.trim() || null;
  if (!customerPhone && userIdResolved && supabase) {
    customerPhone = (await resolveCustomerPhoneFromAuthAdmin(supabase, userIdResolved)) ?? null;
  }

  const flat = buildSnapshotFlat(locked ?? undefined);
  const bookingSnapshotMerged = mergeSnapshotWithFlat(input.snapshot, flat);

  const baseAmountCents = Math.max(0, Math.round(priceSnapshot.subtotal_zar * 100));
  const extrasAmountCents = Math.max(0, Math.round(priceSnapshot.extras_total_zar * 100));
  const totalPaidCents = Math.max(0, Math.round(input.amountCents));
  const serviceFeeCents =
    baseAmountCents != null ? Math.max(0, totalPaidCents - baseAmountCents) : 0;
  const isTest =
    input.isTest === true ||
    process.env.NODE_ENV !== "production" ||
    input.paystackReference.trim().toUpperCase().startsWith("TEST-") ||
    boolish(input.paystackMetadata?.is_test) ||
    boolish(input.paystackMetadata?.test_booking) ||
    boolish(input.paystackMetadata?.client_isTest);

  const paidMoment =
    typeof input.paidAtIso === "string" && input.paidAtIso.trim()
      ? input.paidAtIso.trim()
      : new Date().toISOString();

  /**
   * Customer-chosen cleaner: must NOT assign on payment (DB + product require offer → accept).
   * `bookings_assigned_requires_status` forbids `status=pending` with `selected_cleaner_id`; use
   * `pending_assignment` until `acceptDispatchOffer` sets `assigned` + `cleaner_id`.
   *
   * Recurring generated occurrences are the exception: continuity assign immediately (same as monthly insert).
   */
  const existingIsRecurringGenerated =
    existing &&
    typeof existing === "object" &&
    (existing as { is_recurring_generated?: boolean | null }).is_recurring_generated === true;

  const recurringDirectAssignCleanerId = existingIsRecurringGenerated
    ? checkoutResolution.kind === "honor" && userConfirmedCleanerId != null
      ? userConfirmedCleanerId
      : checkoutResolution.kind === "fallback" && normalizedPickedCleaner != null
        ? normalizedPickedCleaner
        : normalizeUuidCandidate(existingPersistedSelectedCleanerId ?? null)
    : null;

  const userSelectedCheckoutRow =
    recurringDirectAssignCleanerId != null
      ? {
          ...recurringOccurrenceCleanerPatch(recurringDirectAssignCleanerId, { operationalStatus: "pending" }),
          attempted_cleaner_id: recurringDirectAssignCleanerId,
          ...(checkoutResolution.kind === "fallback" && checkoutFallbackReason
            ? { fallback_reason: checkoutFallbackReason }
            : {}),
        }
      : checkoutResolution.kind === "honor" && userConfirmedCleanerId != null
        ? {
            selected_cleaner_id: userConfirmedCleanerId,
            attempted_cleaner_id: userConfirmedCleanerId,
            assignment_type: "user_selected" as const,
            cleaner_id: null as string | null,
            status: "pending_assignment" as const,
            dispatch_status: "searching",
            cleaner_response_status: CLEANER_RESPONSE.NONE,
          }
        : checkoutResolution.kind === "fallback" && normalizedPickedCleaner != null
          ? {
              selected_cleaner_id: normalizedPickedCleaner,
              attempted_cleaner_id: normalizedPickedCleaner,
              assignment_type: "user_selected" as const,
              cleaner_id: null as string | null,
              status: "pending_assignment" as const,
              dispatch_status: "searching",
              cleaner_response_status: CLEANER_RESPONSE.NONE,
              fallback_reason: checkoutResolution.reason,
            }
          : {};

  let paymentConversionSeconds: number | null = null;
  let paymentAttribution = {
    firstTouch: null as "whatsapp" | "sms" | "email" | null,
    lastTouch: null as "whatsapp" | "sms" | "email" | null,
    assistChannels: [] as ("whatsapp" | "sms" | "email")[],
  };
  if (existingPendingPaymentId) {
    paymentAttribution = await resolvePaymentAttributionTouches(supabase, existingPendingPaymentId);
    const { data: metaRow } = await supabase
      .from("bookings")
      .select("payment_link_first_sent_at")
      .eq("id", existingPendingPaymentId)
      .maybeSingle();
    const firstRaw =
      metaRow && typeof metaRow === "object" && metaRow !== null && "payment_link_first_sent_at" in metaRow
        ? (metaRow as { payment_link_first_sent_at?: string | null }).payment_link_first_sent_at
        : null;
    const firstIso = typeof firstRaw === "string" && firstRaw.trim() ? firstRaw.trim() : null;
    if (firstIso) {
      const deltaMs = Date.parse(paidMoment) - Date.parse(firstIso);
      if (Number.isFinite(deltaMs) && deltaMs >= 0) {
        paymentConversionSeconds = Math.floor(deltaMs / 1000);
      }
    }
  }

  const serviceSlugForRow =
    locked?.service != null && String(locked.service).trim()
      ? adminBookingServiceSlug(String(locked.service))
      : null;

  type PendingPersistedRow = {
    location?: string | null;
    date?: string | null;
    time?: string | null;
    service?: string | null;
    service_slug?: string | null;
    service_details?: Record<string, unknown> | null;
    selected_extras?: string[] | null;
    pricing_summary?: unknown;
    booking_snapshot?: unknown;
    duration_minutes?: number | null;
    estimated_duration_minutes?: number | null;
    rooms?: number | null;
    bathrooms?: number | null;
    extras?: unknown;
    suburb?: string | null;
    access_instructions?: string | null;
    parking_instructions?: string | null;
    gate_code?: string | null;
    cleaner_mode?: string | null;
    cleaner_count?: number | null;
    assigned_team_id?: string | null;
    booking_type?: string | null;
    selected_cleaner_id?: string | null;
  };
  const pendingExisting = (existing ?? null) as PendingPersistedRow | null;
  const locationSource: BookingLocationSource = {
    ...(typeof locked === "object" && locked ? locked : {}),
    location:
      (typeof locked?.location === "string" && locked.location.trim()) ||
      pendingExisting?.suburb?.trim() ||
      pendingExisting?.location?.trim() ||
      null,
  };
  const locationContextResolved = await resolveBookingLocationContext(supabase, locationSource);
  const locationId = locationContextResolved.locationId;
  const cityId = locationContextResolved.cityId;
  const ds = await getDemandSupplySnapshotByCity(supabase, cityId);
  const lockedSurge = typeof locked?.surge === "number" && Number.isFinite(locked.surge) ? locked.surge : ds.multiplier;
  const surgeMultiplier = Math.min(2, Math.max(1, lockedSurge));
  const surgeReason = surgeMultiplier > 1 ? getSurgeLabel(surgeMultiplier) : null;
  const countsFromServiceDetails = roomsBathroomsCountsFromServiceDetails(pendingExisting?.service_details);
  const preservedServiceLabel =
    locked?.service != null
      ? getServiceLabel(locked.service)
      : pendingExisting?.service?.trim() ||
        serviceLabelFromBookingRow({
          service: pendingExisting?.service ?? null,
          service_slug: pendingExisting?.service_slug ?? null,
        });
  const preservedExtras =
    extrasSnapshot.length > 0
      ? extrasSnapshot
      : Array.isArray(pendingExisting?.extras) && pendingExisting.extras.length > 0
        ? pendingExisting.extras
        : extrasSnapshot;
  const preservedSnapshot =
    lockedRow != null
      ? bookingSnapshotMerged
      : pendingExisting?.booking_snapshot &&
          typeof pendingExisting.booking_snapshot === "object" &&
          !Array.isArray(pendingExisting.booking_snapshot) &&
          ("serviceDetails" in (pendingExisting.booking_snapshot as object) ||
            "selectedExtras" in (pendingExisting.booking_snapshot as object) ||
            "pricingSummary" in (pendingExisting.booking_snapshot as object))
        ? pendingExisting.booking_snapshot
        : bookingSnapshotMerged;

  const cleanerIdForTenureSnap = userConfirmedCleanerId ?? normalizedPickedCleaner;
  const tenureShareLine = await resolveTenureBasedCleanerShareForBookingRow({
    admin: supabase,
    cleanerId: cleanerIdForTenureSnap,
    bookingDate: locked?.date != null ? String(locked.date) : null,
    bookingTime: locked?.time != null ? String(locked.time) : null,
  });

  /**
   * Prepaid Paystack path: `bookingPayableForWeeklyBatch` requires `payment_status='success'` for
   * weekly cleaner payouts. Monthly-managed rows keep their own lifecycle (pending_monthly → success
   * via `applyMonthlyInvoicePayment`) and must not be overwritten here.
   */
  const isMonthlyManagedRow = await detectMonthlyManagedRowForPaystackFinalize(
    supabase,
    (existing as Record<string, unknown> | null) ?? null,
    userIdResolved,
  );
  const paystackFinalizePaymentStatus: { payment_status?: "success" } = isMonthlyManagedRow
    ? {}
    : { payment_status: "success" };

  const row = {
    paystack_reference: input.paystackReference,
    customer_email: emailStored,
    customer_name: cust?.name?.trim() || null,
    customer_phone: customerPhone,
    ...(userIdResolved ? bookingCustomerOwnershipPatch(userIdResolved, ownershipColumn) : {}),
    amount_paid_cents: input.amountCents,
    total_paid_cents: totalPaidCents,
    base_amount_cents: baseAmountCents,
    extras_amount_cents: extrasAmountCents,
    service_fee_cents: serviceFeeCents,
    currency: input.currency || "ZAR",
    booking_snapshot: preservedSnapshot,
    ...(lockedRow
      ? buildLegacyLockDurationPersistPatch({
          locked: lockedRow,
          schedule:
            locked?.date && locked?.time
              ? { date: String(locked.date), time: String(locked.time) }
              : pendingExisting?.date && pendingExisting?.time
                ? { date: String(pendingExisting.date), time: String(pendingExisting.time) }
                : null,
        })
      : authoritativeDurationPatchFromBookingRow({
          id: existingPendingPaymentId ?? existing?.id ?? null,
          duration_minutes: pendingExisting?.duration_minutes ?? null,
          estimated_duration_minutes: pendingExisting?.estimated_duration_minutes ?? null,
          pricing_summary: pendingExisting?.pricing_summary ?? preservedSnapshot,
          booking_snapshot: preservedSnapshot,
          date: locked?.date ?? pendingExisting?.date ?? null,
          time: locked?.time ?? pendingExisting?.time ?? null,
        })),
    ...(serviceSlugForRow ? { service_slug: serviceSlugForRow } : {}),
    status: "pending",
    dispatch_status: "searching",
    is_test: isTest,
    surge_multiplier: surgeMultiplier,
    surge_reason: surgeReason,
    service: preservedServiceLabel ?? null,
    rooms: locked?.rooms ?? pendingExisting?.rooms ?? countsFromServiceDetails.rooms ?? null,
    bathrooms: locked?.bathrooms ?? pendingExisting?.bathrooms ?? countsFromServiceDetails.bathrooms ?? null,
    extras: preservedExtras,
    location: locked?.location?.trim() || pendingExisting?.location?.trim() || null,
    location_id: locationId,
    city_id: cityId,
    date: locked?.date ?? pendingExisting?.date ?? null,
    time: locked?.time ?? pendingExisting?.time ?? null,
    total_paid_zar: Math.round(paidZar),
    pricing_version_id: pricing_version_id || null,
    price_breakdown: price_breakdown,
    price_snapshot: priceSnapshot as unknown as Record<string, unknown>,
    total_price,
    payment_completed_at: paidMoment,
    ...paystackFinalizePaymentStatus,
    payment_conversion_seconds: paymentConversionSeconds,
    payment_conversion_bucket: paymentConversionBucketFromSeconds(paymentConversionSeconds),
    conversion_channel: paymentAttribution.lastTouch,
    payment_first_touch_channel: paymentAttribution.firstTouch,
    payment_last_touch_channel: paymentAttribution.lastTouch,
    payment_assist_channels: paymentAttribution.assistChannels,
    /**
     * `bookings_assigned_requires_status` forbids `status = pending` with stale `cleaner_id` /
     * `selected_cleaner_id` from the pre-pay row. UPDATE must clear them unless this finalize
     * sets user-selected checkout fields via {@link userSelectedCheckoutRow}, preserves preferred
     * cleaner on `fallback`, or clears both only on true `no_pick`.
     */
    ...postPayAssignmentClear,
    ...checkoutIntentRow,
    ...userSelectedCheckoutRow,
    ...(tenureShareLine != null ? { cleaner_share_percentage: tenureShareLine } : {}),
  };

  let finalizeId: string | null = null;
  let id: string | null = null;
  let inserted: PaymentFinalizationPersistedBookingRow | null = null;

  try {
  // `existingPendingPaymentId` is only set when `existing` was resolved with an `id`, which
  // always sets `pendingFinalizeMatch` ("paystack_reference" from ref lookup, or "id" from
  // internal-id fallback). TS cannot infer that invariant — require both before finalize.
  if (existingPendingPaymentId && pendingFinalizeMatch) {
    const finalizeMatch = pendingFinalizeMatch;
    if (bookingPaystackFinalizeTraceEnabled()) {
      console.log("[SETTING BOOKING POST_PAYMENT]", {
        reference: input.paystackReference,
        pendingFinalizeMatch: finalizeMatch,
        status: row.status,
        dispatch_status: row.dispatch_status,
        cleaner_id: row.cleaner_id ?? null,
        selected_cleaner_id: row.selected_cleaner_id ?? null,
      });
    }
    const { data: updated, error: updateErr } = await finalizePendingPaymentBookingFromPaystack({
      supabase,
      row,
      pendingFinalizeMatch: finalizeMatch,
      existingPendingPaymentId,
      paystackReference: input.paystackReference,
      ownershipColumn,
    });

    if (bookingPaystackFinalizeTraceEnabled()) {
      console.log("[DB UPDATE RESULT]", { data: updated, error: updateErr?.message ?? null });
    }

    if (updateErr) {
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `update pending_payment failed: ${updateErr.message}`, {
        paystackReference: input.paystackReference,
        code: updateErr.code,
      });
      return { ok: false, skipped: true, bookingId: null, error: updateErr.message };
    }
    inserted = updated;

    if (!inserted && !updateErr) {
      const { data: rowAfter } = await supabase
        .from("bookings")
        .select("id, status")
        .eq("paystack_reference", input.paystackReference)
        .maybeSingle();
      const afterSt = String((rowAfter as { status?: string } | null)?.status ?? "");
      if (rowAfter && afterSt && afterSt !== "pending_payment") {
        logPaymentStructured("payment_finalize", {
          reference: input.paystackReference,
          status: "skipped_race",
          booking_id: String((rowAfter as { id: string }).id),
          total: priceSnapshot.total_zar,
          source: input.paystackPersistSource ?? null,
        });
        return {
          ok: true,
          skipped: true,
          bookingId: String((rowAfter as { id: string }).id),
          bookingInDatabase: true,
        };
      }
    }
  } else {
    if (isInlineDecoupledPaystackReference(input.paystackReference)) {
      logPaymentStructured("finalize_rejected_no_pending_row", {
        reference: input.paystackReference,
        metadata_keys: Object.keys(input.paystackMetadata ?? {}),
        source: input.paystackPersistSource ?? null,
      });
      await reportOperationalIssue("error", "upsertBookingFromPaystack", "decoupled_reference_without_pending_row", {
        paystackReference: input.paystackReference,
      });
      return {
        ok: false,
        skipped: true,
        bookingId: null,
        error:
          "No pending booking matched this payment. If money left your account, contact support with your Paystack reference.",
        bookingInDatabase: false,
      };
    }
    if (bookingPaystackFinalizeTraceEnabled()) {
      console.log("[SETTING BOOKING POST_PAYMENT]", {
        reference: input.paystackReference,
        status: row.status,
        dispatch_status: row.dispatch_status,
        cleaner_id: row.cleaner_id ?? null,
        selected_cleaner_id: row.selected_cleaner_id ?? null,
      });
    }
    const { data: ins, error: insertErr } = await insertFinalizedBookingFromPaystack({
      supabase,
      row,
      ownershipColumn,
    });

    if (bookingPaystackFinalizeTraceEnabled()) {
      console.log("[DB INSERT RESULT]", { data: ins, error: insertErr?.message ?? null });
    }

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: again } = await supabase
          .from("bookings")
          .select("id")
          .eq("paystack_reference", input.paystackReference)
          .maybeSingle();
        const dupId =
          again && typeof again === "object" && "id" in again ? String((again as { id: string }).id) : null;
        logPaymentStructured("payment_finalize", {
          reference: input.paystackReference,
          status: "skipped_duplicate",
          booking_id: dupId,
          total: priceSnapshot.total_zar,
          source: input.paystackPersistSource ?? null,
        });
        return { ok: true, skipped: true, bookingId: dupId, bookingInDatabase: true };
      }
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `insert failed: ${insertErr.message}`, {
        paystackReference: input.paystackReference,
        code: insertErr.code,
      });
      return { ok: false, skipped: true, bookingId: null, error: insertErr.message };
    }
    inserted = ins;
  }

  id = inserted?.id ?? null;

  if (!id) {
    const { data: ghost } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("paystack_reference", input.paystackReference)
      .maybeSingle();
    const ghostSt = String((ghost as { status?: string } | null)?.status ?? "");
    if (ghost?.id && ghostSt && ghostSt !== "pending_payment") {
      logPaymentStructured("payment_finalize", {
        reference: input.paystackReference,
        status: "skipped_peer",
        booking_id: String((ghost as { id: string }).id),
        total: priceSnapshot.total_zar,
        source: input.paystackPersistSource ?? null,
      });
      return {
        ok: true,
        skipped: true,
        bookingId: String((ghost as { id: string }).id),
        bookingInDatabase: true,
      };
    }
    await reportOperationalIssue("error", "upsertBookingFromPaystack", "no booking id after upsert paths", {
      paystackReference: input.paystackReference,
    });
    logPaymentStructured("payment_finalize", {
      reference: input.paystackReference,
      status: "upsert_missing_booking_id",
      source: input.paystackPersistSource ?? null,
    });
    return { ok: false, skipped: true, bookingId: null, error: "Booking not found after payment" };
  }

  finalizeId = id;

  const userIdForEffects =
    inserted && typeof inserted === "object"
      ? bookingCustomerKey(inserted as { customer_id?: string | null; user_id?: string | null }) || userIdResolved
      : userIdResolved;

  if (id) {
    const authCode = input.paystackAuthorizationCode?.trim() ?? "";
    if (authCode) {
      const { data: recurringHead } = await supabase
        .from("bookings")
        .select("recurring_id")
        .eq("id", id)
        .maybeSingle();
      const recurringId =
        recurringHead && typeof recurringHead === "object" && "recurring_id" in recurringHead
          ? (recurringHead as { recurring_id: string | null }).recurring_id
          : null;
      if (recurringId) {
        const { error: recAuthErr } = await supabase
          .from("recurring_bookings")
          .update({ paystack_authorization_code: authCode, updated_at: new Date().toISOString() })
          .eq("id", recurringId);
        if (recAuthErr) {
          await reportOperationalIssue("warn", "upsertBookingFromPaystack", `recurring auth save: ${recAuthErr.message}`, {
            bookingId: id,
            recurringId,
          });
        }
      }
    }

    await refreshRecurringPaymentStateForBooking(supabase, id);

    const v2TeamPromote = await promoteV2TeamBookingAfterPayment(supabase, id);
    if (!v2TeamPromote.ok) {
      void reportOperationalIssue("warn", "upsertBookingFromPaystack", v2TeamPromote.error, {
        bookingId: id,
        paystackReference: input.paystackReference,
      });
    }

    await syncPreferredCleanerRosterFromBookingRow(supabase, id, {
      booking_snapshot: pendingExisting?.booking_snapshot ?? bookingSnapshotMerged,
      selected_cleaner_id:
        userConfirmedCleanerId ??
        normalizedPickedCleaner ??
        (typeof existingPersistedSelectedCleanerId === "string" ? existingPersistedSelectedCleanerId : null) ??
        pendingExisting?.selected_cleaner_id ??
        null,
    });

    const referralCode = String(input.paystackMetadata?.referral_code ?? input.paystackMetadata?.client_referralCode ?? "").trim();
    if (referralCode) {
      await createPendingCustomerReferral({
        admin: supabase,
        refCode: referralCode,
        referredUserId: userIdResolved,
        referredEmail: emailStored,
      });
    }

    const subscriptionFrequencyRaw = String(
      input.paystackMetadata?.client_subscriptionFrequency ??
        input.paystackMetadata?.subscription_frequency ??
        "",
    )
      .trim()
      .toLowerCase();
    const subscriptionFrequency =
      subscriptionFrequencyRaw === "weekly" ||
      subscriptionFrequencyRaw === "biweekly" ||
      subscriptionFrequencyRaw === "monthly"
        ? subscriptionFrequencyRaw
        : null;
    // Phase 2A: legacy `subscriptions` table deprecated — use `recurring_bookings` only.
    if (subscriptionFrequency) {
      console.warn("Subscriptions deprecated — ignoring subscriptionFrequency", { subscriptionFrequency });
    }

    /** Customer-picked cleaner: dispatch offer first; assignment finalizes on accept (see `acceptDispatchOffer`). */
    const dispatchOfferCleanerId = recurringDirectAssignCleanerId
      ? null
      : checkoutPaidDispatchOfferCleanerId({
      checkoutResolution,
      userConfirmedCleanerId,
      normalizedPickedCleaner,
    });
    if (dispatchOfferCleanerId) {
      const { dateYmd: dispatchDate, timeHm: dispatchTime } = resolvePreferredDispatchScheduleAtPayment({
        finalizeRow: row,
        pendingRow: pendingExisting,
        lockedRow,
        bookingSnapshot: preservedSnapshot,
      });
      const { data: priorityRow } = await supabase
        .from("bookings")
        .select("booking_priority, dispatch_attempt_count")
        .eq("id", id)
        .maybeSingle();
      const dispatchResult = await startPreferredCleanerDispatchAfterPayment(supabase, {
        bookingId: id,
        preferredCleanerId: dispatchOfferCleanerId,
        dateYmd: dispatchDate,
        timeHm: dispatchTime,
        bookingPriority:
          priorityRow && typeof priorityRow === "object"
            ? (priorityRow as { booking_priority?: string | null }).booking_priority
            : null,
        paystackReference: input.paystackReference,
        dispatchAttemptCount:
          priorityRow && typeof priorityRow === "object"
            ? (priorityRow as { dispatch_attempt_count?: number | null }).dispatch_attempt_count ?? 0
            : 0,
      });
      if (
        dispatchResult.kind === "preferred_offer_sent" ||
        dispatchResult.kind === "skipped_urgent"
      ) {
        metrics.increment("booking.checkout_assignment", {
          assignment_type: "user_selected",
          bookingId: id,
          selected_cleaner_id: dispatchOfferCleanerId,
          phase: dispatchResult.kind === "skipped_urgent" ? "skipped_urgent_backup" : "preferred_offered",
        });
      } else if (dispatchResult.kind === "offer_failed") {
        await escalateFailedCheckoutDispatchOffer({
          supabase,
          bookingId: id,
          paystackReference: input.paystackReference,
          cleanerId: dispatchOfferCleanerId,
          offerError: dispatchResult.error,
        });
        await dispatchFallbackAfterSelectedCleanerOfferInsertFailure({
          supabase,
          bookingId: id,
          paystackReference: input.paystackReference,
          failedSelectedCleanerId: dispatchOfferCleanerId,
        });
      }
    } else if (!normalizedPickedCleaner) {
      const autoAssignmentTag = selectionInvalidatedCleaner ? "auto_fallback" : "auto_dispatch";
      const smartAssignOpts =
        selectionInvalidatedCleaner && pickedCleanerUuid
          ? { excludeCleanerIds: [pickedCleanerUuid] as const }
          : undefined;
      /** Booking V2 team checkout already selected a team — do not run marketplace auto-assign. */
      const skipAutoDispatchForV2Team =
        String(pendingExisting?.cleaner_mode ?? "").trim().toLowerCase() === "team" &&
        Boolean(String(pendingExisting?.assigned_team_id ?? "").trim());
      /** Smart dispatch unless explicitly disabled (`AUTO_DISPATCH_CLEANERS=false`). */
      const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false" && !skipAutoDispatchForV2Team;
      const offerAssignFallback = process.env.CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK === "true";
      if (autoDispatch) {
        const r = await assignBestCleaner(supabase, id, {
          source: "paystack_checkout",
          smartAssign: smartAssignOpts,
        });
        const freshAuto = r.ok && !(r as { noOp?: boolean }).noOp;
        if (freshAuto) {
          await supabase
            .from("bookings")
            .update(
              buildAutoAssignmentPatch(
                autoAssignmentTag,
                selectionInvalidatedCleaner,
                pickedCleanerUuid,
                checkoutFallbackReason,
              ),
            )
            .eq("id", id)
            .is("assignment_type", null);
          if (r.assignmentKind === "individual") {
            await notifyCleanerAssignedBooking(supabase, id, r.cleanerId);
          }
          metrics.increment("booking.checkout_assignment", {
            assignment_type: autoAssignmentTag,
            bookingId: id,
            selected_cleaner_id: pickedCleanerUuid,
            assigned_cleaner_id: r.assignmentKind === "individual" ? r.cleanerId : null,
            assigned_team_id: r.assignmentKind === "team" ? r.teamId : null,
            ...(autoAssignmentTag === "auto_fallback" && checkoutFallbackReason
              ? { fallback_reason: checkoutFallbackReason }
              : {}),
          });
        } else if (!r.ok && offerAssignFallback) {
          const smart = await runAdminAssignSmart(supabase, {
            bookingId: id,
            force: false,
            maxAttempts: 25,
            cleanerIds: null,
            autoEscalateExtremeSla: null,
          });
          if (smart.ok) {
            await supabase
              .from("bookings")
              .update(
                buildAutoAssignmentPatch(
                  autoAssignmentTag,
                  selectionInvalidatedCleaner,
                  pickedCleanerUuid,
                  checkoutFallbackReason,
                ),
              )
              .eq("id", id)
              .is("assignment_type", null);
            await notifyCleanerAssignedBooking(supabase, id, smart.cleanerId);
            metrics.increment("booking.checkout_assignment", {
              assignment_type: autoAssignmentTag,
              bookingId: id,
              selected_cleaner_id: pickedCleanerUuid,
              assigned_cleaner_id: smart.cleanerId,
              ...(autoAssignmentTag === "auto_fallback" && checkoutFallbackReason
                ? { fallback_reason: checkoutFallbackReason }
                : {}),
            });
          }
        }
      } else if (offerAssignFallback) {
        const smart = await runAdminAssignSmart(supabase, {
          bookingId: id,
          force: false,
          maxAttempts: 25,
          cleanerIds: null,
          autoEscalateExtremeSla: null,
        });
        if (smart.ok) {
          await supabase
            .from("bookings")
            .update(
              buildAutoAssignmentPatch(
                autoAssignmentTag,
                selectionInvalidatedCleaner,
                pickedCleanerUuid,
                checkoutFallbackReason,
              ),
            )
            .eq("id", id)
            .is("assignment_type", null);
          await notifyCleanerAssignedBooking(supabase, id, smart.cleanerId);
          metrics.increment("booking.checkout_assignment", {
            assignment_type: autoAssignmentTag,
            bookingId: id,
            selected_cleaner_id: pickedCleanerUuid,
            assigned_cleaner_id: smart.cleanerId,
            ...(autoAssignmentTag === "auto_fallback" && checkoutFallbackReason
              ? { fallback_reason: checkoutFallbackReason }
              : {}),
          });
        }
      }
    }
    const createdAt =
      inserted && typeof inserted === "object" && "created_at" in inserted
        ? String((inserted as { created_at?: string }).created_at ?? "")
        : "";
    try {
      await cancelUnsentBookingPaymentRecoveryJobs(supabase, id);
      const locked = input.snapshot?.locked;
      await recordBookingSideEffects({
        supabase,
        bookingId: id,
        userId: userIdForEffects,
        customerEmail: emailStored,
        amountCents: input.amountCents,
        paystackReference: input.paystackReference,
        createdAt: createdAt || new Date().toISOString(),
        appointmentDateYmd: locked?.date ?? null,
        appointmentTimeHm: locked?.time ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `recordBookingSideEffects threw: ${msg}`, {
        bookingId: id,
        paystackReference: input.paystackReference,
      });
    }

    void syncUserPrimaryCityFromBooking(supabase, userIdForEffects, cityId);
    void processCustomerReferralAfterFirstPaidBooking({
      admin: supabase,
      bookingUserId: userIdForEffects,
      customerEmail: emailStored,
      bookingId: id,
    });
    void attributePaidBookingToGrowthOutcomes({
      admin: supabase,
      userId: userIdForEffects,
      bookingId: id,
      amountCents: input.amountCents,
      paidAtIso: paidMoment,
    });
    void recordConversionExperimentResultsOnPayment(supabase, {
      bookingId: id,
      userId: userIdForEffects,
      revenueCents: input.amountCents,
      paidAtIso: paidMoment,
    });
    void learnFromPaymentSuccess(supabase, {
      userId: userIdForEffects,
      bookingId: id,
      amountCents: input.amountCents,
    });

    const { data: persistedForEarnings } = await supabase
      .from("bookings")
      .select("status, cleaner_id, payout_owner_cleaner_id, is_team_job")
      .eq("id", id)
      .maybeSingle();
    if (
      persistedForEarnings &&
      String((persistedForEarnings as { status?: string | null }).status ?? "").toLowerCase() === "completed"
    ) {
      const persistCleanerId = resolvePersistCleanerIdForBooking(persistedForEarnings as BookingPersistIdsRow);
      if (persistCleanerId) {
        void logSystemEvent({
          level: "info",
          source: "upsertBookingFromPaystack",
          message: "earnings_trigger_completed_status",
          context: { bookingId: id, paystackReference: input.paystackReference },
        });
        const pr = await persistCleanerPayoutIfUnset({
          admin: supabase,
          bookingId: id,
          cleanerId: persistCleanerId,
        });
        if (!pr.ok) {
          void reportOperationalIssue("warn", "upsertBookingFromPaystack", pr.error ?? "persist failed", {
            bookingId: id,
            cleanerId: persistCleanerId,
          });
        }
      } else {
        void logSystemEvent({
          level: "warn",
          source: "upsertBookingFromPaystack",
          message: "earnings_skipped_completed_missing_cleaner",
          context: { bookingId: id },
        });
      }
    }

    if (userIdForEffects) {
      const uid = userIdForEffects;
      void (async () => {
        try {
          const ctx = await loadCustomerGrowthContext(supabase, uid);
          if (ctx) await persistCustomerSegmentRow(supabase, ctx);
          await logPostBookingGrowthDecision(supabase, uid);
        } catch {
          /* non-fatal */
        }
      })();
    }
  }

  logPaymentStructured("payment_finalize", {
    reference: input.paystackReference,
    status: "pending",
    total: priceSnapshot.total_zar,
    booking_id: id,
    source: input.paystackPersistSource ?? null,
  });
  return { ok: true, skipped: false, bookingId: id, bookingInDatabase: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logPaymentStructured("payment_finalize", {
      reference: input.paystackReference,
      status: "reconciliation_required",
      error: msg.slice(0, 2000),
    });
    await reportOperationalIssue("critical", "upsertBookingFromPaystack", `booking finalization threw: ${msg.slice(0, 500)}`, {
      paystackReference: input.paystackReference,
      bookingId: finalizeId ?? existingPendingPaymentId ?? null,
      errorType: "payment_finalize_throw",
    });
    if (finalizeId) {
      await supabase.from("bookings").update({ status: "payment_reconciliation_required" }).eq("id", finalizeId);
    } else if (pendingFinalizeMatch === "id" && existingPendingPaymentId) {
      await supabase
        .from("bookings")
        .update({ status: "payment_reconciliation_required" })
        .eq("id", existingPendingPaymentId)
        .eq("status", "pending_payment");
    } else {
      await supabase
        .from("bookings")
        .update({ status: "payment_reconciliation_required" })
        .eq("paystack_reference", input.paystackReference)
        .eq("status", "pending_payment");
    }
    void enqueueFailedJob("booking_finalize", {
      paystackReference: input.paystackReference,
      error: msg,
      payload: input.paystackMetadata ?? null,
    });
    return {
      ok: false,
      skipped: true,
      bookingId: finalizeId ?? existingPendingPaymentId,
      reason: "finalization_failed",
      error: msg,
      bookingInDatabase: true,
      recoveryEnqueue: true,
    };
  }
}
