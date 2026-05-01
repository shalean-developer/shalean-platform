import { getServiceLabel } from "@/components/booking/serviceCategories";
import {
  checkoutPriceSnapshotFromLegacyPriceSnapshotV1,
  parseCheckoutPriceSnapshotV1FromMeta,
} from "@/lib/booking/priceSnapshotBooking";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { resolveBookingLocationContext } from "@/lib/booking/resolveLocationId";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getDemandSupplySnapshotByCity, getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { learnFromPaymentSuccess } from "@/lib/ai-autonomy/learningLoop";
import { recordConversionExperimentResultsOnPayment } from "@/lib/conversion/conversionExperimentOutcomes";
import { attributePaidBookingToGrowthOutcomes } from "@/lib/growth/growthActionOutcomes";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { logPostBookingGrowthDecision } from "@/lib/growth/postBookingGrowthHint";
import { syncUserPrimaryCityFromBooking } from "@/lib/growth/syncPrimaryCity";
import { createPendingCustomerReferral, processCustomerReferralAfterFirstPaidBooking } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkoutDispatchOfferTtlSeconds,
  resolveCheckoutCleanerSelection,
} from "@/lib/booking/checkoutCleanerEligibility";
import { paymentConversionBucketFromSeconds } from "@/lib/booking/paymentConversionBucket";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { resolvePaymentAttributionTouches } from "@/lib/pay/paymentLinkDeliveryEvents";
import { FALLBACK_REASON_CLEANER_NOT_AVAILABLE } from "@/lib/booking/fallbackReason";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { metrics } from "@/lib/metrics/counters";
import { pickUserSelectedCleanerId } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import { resolvePersistCleanerIdForBooking, type BookingPersistIdsRow } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resolveTenureBasedCleanerShareForBookingRow } from "@/lib/payout/tenureBasedCleanerLineShare";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { recordSystemMetric } from "@/lib/observability/recordSystemMetric";

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

export async function upsertBookingFromPaystack(input: UpsertBookingInput): Promise<UpsertBookingFromPaystackResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("warn", "upsertBookingFromPaystack", "Supabase admin client not configured", {
      paystackReference: input.paystackReference,
    });
    return { ok: false, skipped: true, bookingId: null, error: "Supabase not configured" };
  }

  const { data: existing, error: selectErr } = await supabase
    .from("bookings")
    .select("id, status, is_recurring_generated, price_snapshot")
    .eq("paystack_reference", input.paystackReference)
    .maybeSingle();

  if (selectErr) {
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `select failed: ${selectErr.message}`, {
      paystackReference: input.paystackReference,
    });
    return { ok: false, skipped: true, bookingId: null, error: selectErr.message };
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
    console.warn("Lock invalid — using snapshot fallback");
  }

  const priceSnapshotFromMeta = parseCheckoutPriceSnapshotV1FromMeta(input.paystackMetadata ?? null);
  let priceSnapshot =
    priceSnapshotFromMeta ??
    (existing && typeof existing === "object" && "price_snapshot" in existing
      ? checkoutPriceSnapshotFromLegacyPriceSnapshotV1((existing as { price_snapshot?: unknown }).price_snapshot)
      : null);
  if (!priceSnapshot) {
    throw new Error("Missing price snapshot — cannot safely finalize booking");
  }

  console.log("[PRICE SNAPSHOT USED]", {
    reference: input.paystackReference,
    total: priceSnapshot.total_zar,
    source: priceSnapshotFromMeta ? "metadata" : "db_legacy",
  });

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
    await supabase.from("bookings").update(mismatchPatch).eq("paystack_reference", input.paystackReference).eq("status", "pending_payment");
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

  const pickedCleanerUuid = pickUserSelectedCleanerId(lockedRow, input.snapshot);
  const checkoutResolution = await resolveCheckoutCleanerSelection(supabase, {
    pickedCleanerUuid,
    locked: lockedRow,
  });
  let userConfirmedCleanerId: string | null =
    checkoutResolution.kind === "honor" ? checkoutResolution.cleanerId : null;
  const selectionInvalidatedCleaner = checkoutResolution.kind === "fallback";
  const checkoutFallbackReason =
    checkoutResolution.kind === "fallback" ? checkoutResolution.reason : null;
  const checkoutIntentRow =
    checkoutResolution.kind === "fallback" ? { attempted_cleaner_id: checkoutResolution.attemptedId } : {};

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

  const extrasSnapshotRaw =
    Array.isArray(locked?.extras_line_items) && locked.extras_line_items.length > 0
      ? locked.extras_line_items.map(({ slug, name, price }) => ({ slug, name, price }))
      : [];
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

  const flat = buildSnapshotFlat(locked ?? undefined);
  const bookingSnapshotMerged = mergeSnapshotWithFlat(input.snapshot, flat);

  const locationContext = await resolveBookingLocationContext(supabase, locked ?? undefined);
  const locationId = locationContext.locationId;
  const cityId = locationContext.cityId;
  const ds = await getDemandSupplySnapshotByCity(supabase, cityId);
  const lockedSurge = typeof locked?.surge === "number" && Number.isFinite(locked.surge) ? locked.surge : ds.multiplier;
  const surgeMultiplier = Math.min(2, Math.max(1, lockedSurge));
  const surgeReason = surgeMultiplier > 1 ? getSurgeLabel(surgeMultiplier) : null;
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

  const userSelectedRow =
    userConfirmedCleanerId != null
      ? {
          selected_cleaner_id: userConfirmedCleanerId,
          attempted_cleaner_id: userConfirmedCleanerId,
          assignment_type: "user_selected",
          cleaner_id: userConfirmedCleanerId,
          status: "assigned",
          dispatch_status: "assigned",
          assigned_at: paidMoment,
          cleaner_response_status: CLEANER_RESPONSE.PENDING,
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

  const pickedTrim = pickedCleanerUuid != null ? String(pickedCleanerUuid).trim() : "";
  const cleanerIdForTenureSnap =
    userConfirmedCleanerId ??
    (/^[0-9a-f-]{36}$/i.test(pickedTrim) ? pickedTrim : null);
  const tenureShareLine = await resolveTenureBasedCleanerShareForBookingRow({
    admin: supabase,
    cleanerId: cleanerIdForTenureSnap,
    bookingDate: locked?.date != null ? String(locked.date) : null,
    bookingTime: locked?.time != null ? String(locked.time) : null,
  });

  const row = {
    paystack_reference: input.paystackReference,
    customer_email: emailStored,
    customer_name: cust?.name?.trim() || null,
    customer_phone: cust?.phone?.trim() || null,
    user_id: userIdResolved,
    amount_paid_cents: input.amountCents,
    total_paid_cents: totalPaidCents,
    base_amount_cents: baseAmountCents,
    extras_amount_cents: extrasAmountCents,
    service_fee_cents: serviceFeeCents,
    currency: input.currency || "ZAR",
    booking_snapshot: bookingSnapshotMerged,
    ...(serviceSlugForRow ? { service_slug: serviceSlugForRow } : {}),
    status: "pending",
    dispatch_status: "searching",
    is_test: isTest,
    surge_multiplier: surgeMultiplier,
    surge_reason: surgeReason,
    service: locked?.service != null ? getServiceLabel(locked.service) : null,
    rooms: locked?.rooms ?? null,
    bathrooms: locked?.bathrooms ?? null,
    extras: extrasSnapshot,
    location: locked?.location?.trim() || null,
    location_id: locationId,
    city_id: cityId,
    date: locked?.date ?? null,
    time: locked?.time ?? null,
    total_paid_zar: Math.round(paidZar),
    pricing_version_id: pricing_version_id || null,
    price_breakdown: price_breakdown,
    price_snapshot: priceSnapshot as unknown as Record<string, unknown>,
    total_price,
    payment_completed_at: paidMoment,
    payment_conversion_seconds: paymentConversionSeconds,
    payment_conversion_bucket: paymentConversionBucketFromSeconds(paymentConversionSeconds),
    conversion_channel: paymentAttribution.lastTouch,
    payment_first_touch_channel: paymentAttribution.firstTouch,
    payment_last_touch_channel: paymentAttribution.lastTouch,
    payment_assist_channels: paymentAttribution.assistChannels,
    ...checkoutIntentRow,
    ...userSelectedRow,
    ...(tenureShareLine != null ? { cleaner_share_percentage: tenureShareLine } : {}),
  };

  type PersistedRow = { id: string; created_at?: string; user_id?: string | null };
  let finalizeId: string | null = null;
  let id: string | null = null;
  let inserted: PersistedRow | null = null;

  try {
  if (existingPendingPaymentId) {
    const { paystack_reference: _ref, ...updatePayload } = row;
    void _ref;
    const { data: updated, error: updateErr } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("paystack_reference", input.paystackReference)
      .eq("status", "pending_payment")
      .select("id, created_at, user_id")
      .maybeSingle();

    if (updateErr) {
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `update pending_payment failed: ${updateErr.message}`, {
        paystackReference: input.paystackReference,
        code: updateErr.code,
      });
      return { ok: false, skipped: true, bookingId: null, error: updateErr.message };
    }
    inserted =
      updated && typeof updated === "object" && "id" in updated ? (updated as PersistedRow) : null;

    if (!inserted && !updateErr) {
      const { data: rowAfter } = await supabase
        .from("bookings")
        .select("id, status")
        .eq("paystack_reference", input.paystackReference)
        .maybeSingle();
      const afterSt = String((rowAfter as { status?: string } | null)?.status ?? "");
      if (rowAfter && afterSt && afterSt !== "pending_payment") {
        console.log("[PAYSTACK UPSERT]", {
          reference: input.paystackReference,
          skipped: true,
          ok: true,
          paystackPersistSource: input.paystackPersistSource ?? null,
          race: "conditional_update_noop_already_finalized",
        });
        console.log("[PAYMENT FINALIZED]", {
          reference: input.paystackReference,
          status: "skipped_race",
          total: priceSnapshot.total_zar,
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
    const { data: ins, error: insertErr } = await supabase
      .from("bookings")
      .insert(row)
      .select("id, created_at, user_id")
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: again } = await supabase
          .from("bookings")
          .select("id")
          .eq("paystack_reference", input.paystackReference)
          .maybeSingle();
        const dupId =
          again && typeof again === "object" && "id" in again ? String((again as { id: string }).id) : null;
        console.log("[PAYSTACK UPSERT]", {
          reference: input.paystackReference,
          skipped: true,
          ok: true,
          paystackPersistSource: input.paystackPersistSource ?? null,
          race: "insert_duplicate_paystack_reference",
        });
        console.log("[PAYMENT FINALIZED]", {
          reference: input.paystackReference,
          status: "skipped_duplicate",
          total: priceSnapshot.total_zar,
        });
        return { ok: true, skipped: true, bookingId: dupId, bookingInDatabase: true };
      }
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `insert failed: ${insertErr.message}`, {
        paystackReference: input.paystackReference,
        code: insertErr.code,
      });
      return { ok: false, skipped: true, bookingId: null, error: insertErr.message };
    }
    inserted = ins && typeof ins === "object" && "id" in ins ? (ins as PersistedRow) : null;
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
      console.log("[PAYSTACK UPSERT]", {
        reference: input.paystackReference,
        skipped: true,
        ok: true,
        paystackPersistSource: input.paystackPersistSource ?? null,
        race: "peer_persisted_same_reference",
      });
      console.log("[PAYMENT FINALIZED]", {
        reference: input.paystackReference,
        status: "skipped_peer",
        total: priceSnapshot.total_zar,
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
    console.log("[PAYSTACK UPSERT]", {
      reference: input.paystackReference,
      skipped: true,
      ok: false,
      bookingId: null,
      paystackPersistSource: input.paystackPersistSource ?? null,
    });
    return { ok: false, skipped: true, bookingId: null, error: "Booking not found after payment" };
  }

  finalizeId = id;

  const userIdForEffects =
    inserted && typeof inserted === "object" && "user_id" in inserted
      ? ((inserted as { user_id?: string | null }).user_id ?? userIdResolved)
      : userIdResolved;

  if (id) {
    console.log("[PAYSTACK UPSERT]", {
      reference: input.paystackReference,
      skipped: false,
      ok: true,
      bookingId: id,
      paystackPersistSource: input.paystackPersistSource ?? null,
    });
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
    if (userConfirmedCleanerId) {
      const ttl = checkoutDispatchOfferTtlSeconds();
      const offerRes = await createDispatchOfferRow({
        supabase,
        bookingId: id,
        cleanerId: userConfirmedCleanerId,
        rankIndex: 0,
        ttlSeconds: ttl,
      });
      if (offerRes.ok) {
        metrics.increment("booking.checkout_assignment", {
          assignment_type: "user_selected",
          bookingId: id,
          selected_cleaner_id: userConfirmedCleanerId,
          phase: "offered",
        });
      } else {
        const r = await assignBestCleaner(supabase, id, {
          source: "paystack_checkout",
          smartAssign: { excludeCleanerIds: [userConfirmedCleanerId] },
        });
        const freshAssign = r.ok && !(r as { noOp?: boolean }).noOp;
        if (freshAssign) {
          const { error: tagErr } = await supabase
            .from("bookings")
            .update({
              assignment_type: "auto_fallback",
              fallback_reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE,
              attempted_cleaner_id: userConfirmedCleanerId,
            })
            .eq("id", id);
          if (tagErr) {
            await reportOperationalIssue("warn", "upsertBookingFromPaystack", `fallback tag: ${tagErr.message}`, {
              bookingId: id,
            });
          }
          if (r.assignmentKind === "individual") {
            try {
              await notifyCleanerAssignedBooking(supabase, id, r.cleanerId);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              await reportOperationalIssue("error", "upsertBookingFromPaystack", `notify after offer insert fail: ${msg}`, {
                bookingId: id,
              });
            }
          }
          metrics.increment("booking.checkout_assignment", {
            assignment_type: "auto_fallback",
            bookingId: id,
            selected_cleaner_id: userConfirmedCleanerId,
            assigned_cleaner_id: r.assignmentKind === "individual" ? r.cleanerId : null,
            assigned_team_id: r.assignmentKind === "team" ? r.teamId : null,
            fallback_reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE,
          });
        } else if (!r.ok) {
          await reportOperationalIssue("warn", "upsertBookingFromPaystack", "user_selected offer failed and re-dispatch failed", {
            bookingId: id,
            paystackReference: input.paystackReference,
            offerError: offerRes.error,
            dispatchError: r.error,
          });
        }
      }
    } else {
      const autoAssignmentTag = selectionInvalidatedCleaner ? "auto_fallback" : "auto_dispatch";
      const smartAssignOpts =
        selectionInvalidatedCleaner && pickedCleanerUuid
          ? { excludeCleanerIds: [pickedCleanerUuid] as const }
          : undefined;
      /** Smart dispatch unless explicitly disabled (`AUTO_DISPATCH_CLEANERS=false`). */
      const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
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
    console.error("[BOOKING FINALIZATION FAILED]", err);
    if (finalizeId) {
      await supabase.from("bookings").update({ status: "payment_reconciliation_required" }).eq("id", finalizeId);
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
