import { getServiceLabel } from "@/components/booking/serviceCategories";
import { validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import { resolveRatesSnapshotForLockedBooking } from "@/lib/booking/resolveRatesSnapshot";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { assignBestCleaner } from "@/lib/marketplace-intelligence/assignBestCleaner";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getDemandSupplySnapshotByCity, getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { attributePaidBookingToGrowthOutcomes } from "@/lib/growth/growthActionOutcomes";
import { loadCustomerGrowthContext, persistCustomerSegmentRow } from "@/lib/growth/loadCustomerGrowthContext";
import { logPostBookingGrowthDecision } from "@/lib/growth/postBookingGrowthHint";
import { syncUserPrimaryCityFromBooking } from "@/lib/growth/syncPrimaryCity";
import { createPendingCustomerReferral, processCustomerReferralAfterFirstPaidBooking } from "@/lib/referrals/server";
import { createSubscriptionFromBooking, type SubscriptionFrequency } from "@/lib/subscriptions/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkoutDispatchOfferTtlSeconds,
  resolveCheckoutCleanerSelection,
} from "@/lib/booking/checkoutCleanerEligibility";
import { paymentConversionBucketFromSeconds } from "@/lib/booking/paymentConversionBucket";
import { resolvePaymentAttributionTouches } from "@/lib/pay/paymentLinkDeliveryEvents";
import { FALLBACK_REASON_CLEANER_NOT_AVAILABLE } from "@/lib/booking/fallbackReason";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import { metrics } from "@/lib/metrics/counters";
import { pickUserSelectedCleanerId } from "@/lib/booking/userSelectedCleanerFromSnapshot";

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
export async function upsertBookingFromPaystack(input: UpsertBookingInput): Promise<{
  skipped: boolean;
  bookingId: string | null;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await reportOperationalIssue("warn", "upsertBookingFromPaystack", "Supabase admin client not configured", {
      paystackReference: input.paystackReference,
    });
    return { skipped: true, bookingId: null, error: "Supabase not configured" };
  }

  const { data: existing, error: selectErr } = await supabase
    .from("bookings")
    .select("id, status, is_recurring_generated")
    .eq("paystack_reference", input.paystackReference)
    .maybeSingle();

  if (selectErr) {
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `select failed: ${selectErr.message}`, {
      paystackReference: input.paystackReference,
    });
    return { skipped: true, bookingId: null, error: selectErr.message };
  }

  let existingPendingPaymentId: string | null = null;
  let pendingRowIsRecurringGenerated = false;
  if (existing && typeof existing === "object" && "id" in existing) {
    const st = String((existing as { status?: string }).status ?? "");
    if (st !== "pending_payment") {
      return { skipped: true, bookingId: String((existing as { id: string }).id) };
    }
    existingPendingPaymentId = String((existing as { id: string }).id);
    pendingRowIsRecurringGenerated = Boolean((existing as { is_recurring_generated?: boolean }).is_recurring_generated);
  }

  const locked = input.snapshot?.locked;
  const lockedRow = parseLockedBookingFromUnknown(locked ?? null);

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

  let price_breakdown: Record<string, unknown> | null = null;
  let total_price: number | null = null;
  let pricing_version_id: string | null = null;
  let catalogSnap: Awaited<ReturnType<typeof resolveRatesSnapshotForLockedBooking>> = null;
  if (lockedRow) {
    catalogSnap = await resolveRatesSnapshotForLockedBooking(supabase, lockedRow);
    if (catalogSnap) {
      const v = validateLockForCheckout(lockedRow, Date.now(), {
        skipExpiryCheck: true,
        ratesSnapshot: catalogSnap,
        bookingId: existingPendingPaymentId,
        skipPriceDurationParity: pendingRowIsRecurringGenerated,
      });
      if (v.ok && v.serverQuote) {
        price_breakdown = { ...v.serverQuote, job: v.jobSubtotalSplit };
        total_price = v.visitTotalZar;
      }
    }
    pricing_version_id = lockedRow.pricing_version_id?.trim() ?? null;
  }

  const extrasSnapshot =
    Array.isArray(locked?.extras_line_items) && locked.extras_line_items.length > 0
      ? locked.extras_line_items.map(({ slug, name, price }) => ({ slug, name, price }))
      : catalogSnap
        ? extrasLineItemsFromSnapshot(catalogSnap, locked?.extras ?? [], locked?.service ?? null).map(
            ({ slug, name, price }) => ({
              slug,
              name,
              price,
            }),
          )
        : [];
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

  const locationContext = await resolveLocationContextFromLabel(supabase, locked?.location?.trim() ?? null);
  const locationId = locationContext.locationId;
  const cityId = locationContext.cityId;
  const ds = await getDemandSupplySnapshotByCity(supabase, cityId);
  const lockedSurge = typeof locked?.surge === "number" && Number.isFinite(locked.surge) ? locked.surge : ds.multiplier;
  const surgeMultiplier = Math.min(2, Math.max(1, lockedSurge));
  const surgeReason = surgeMultiplier > 1 ? getSurgeLabel(surgeMultiplier) : null;
  const baseAmountCents =
    price_breakdown && typeof (price_breakdown as { subtotalZar?: unknown }).subtotalZar === "number"
      ? Math.max(0, Math.round(Number((price_breakdown as { subtotalZar: number }).subtotalZar) * 100))
      : null;
  const extrasAmountCents =
    price_breakdown &&
    typeof (price_breakdown as { job?: { extrasZar?: unknown } }).job?.extrasZar === "number"
      ? Math.max(0, Math.round(Number((price_breakdown as { job: { extrasZar: number } }).job.extrasZar) * 100))
      : null;
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

  const userSelectedRow =
    userConfirmedCleanerId != null
      ? {
          selected_cleaner_id: userConfirmedCleanerId,
          attempted_cleaner_id: userConfirmedCleanerId,
          assignment_type: "user_selected",
          status: "pending",
          dispatch_status: "searching",
        }
      : {};

  const paidMoment =
    typeof input.paidAtIso === "string" && input.paidAtIso.trim()
      ? input.paidAtIso.trim()
      : new Date().toISOString();

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
    total_paid_zar:
      typeof input.snapshot?.total_zar === "number"
        ? input.snapshot.total_zar
        : Math.round(input.amountCents / 100),
    pricing_version_id: pricing_version_id || null,
    price_breakdown: price_breakdown,
    total_price: total_price ?? null,
    payment_completed_at: paidMoment,
    payment_conversion_seconds: paymentConversionSeconds,
    payment_conversion_bucket: paymentConversionBucketFromSeconds(paymentConversionSeconds),
    conversion_channel: paymentAttribution.lastTouch,
    payment_first_touch_channel: paymentAttribution.firstTouch,
    payment_last_touch_channel: paymentAttribution.lastTouch,
    payment_assist_channels: paymentAttribution.assistChannels,
    ...checkoutIntentRow,
    ...userSelectedRow,
  };

  type PersistedRow = { id: string; created_at?: string; user_id?: string | null };
  let inserted: PersistedRow | null = null;

  if (existingPendingPaymentId) {
    const { paystack_reference: _ref, ...updatePayload } = row;
    void _ref;
    const { data: updated, error: updateErr } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("id", existingPendingPaymentId)
      .eq("status", "pending_payment")
      .select("id, created_at, user_id")
      .maybeSingle();

    if (updateErr) {
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `update pending_payment failed: ${updateErr.message}`, {
        paystackReference: input.paystackReference,
        code: updateErr.code,
      });
      return { skipped: true, bookingId: null, error: updateErr.message };
    }
    inserted =
      updated && typeof updated === "object" && "id" in updated ? (updated as PersistedRow) : null;
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
        const id =
          again && typeof again === "object" && "id" in again ? String((again as { id: string }).id) : null;
        return { skipped: true, bookingId: id };
      }
      await reportOperationalIssue("error", "upsertBookingFromPaystack", `insert failed: ${insertErr.message}`, {
        paystackReference: input.paystackReference,
        code: insertErr.code,
      });
      return { skipped: true, bookingId: null, error: insertErr.message };
    }
    inserted = ins && typeof ins === "object" && "id" in ins ? (ins as PersistedRow) : null;
  }

  const id = inserted?.id ?? null;

  const userIdForEffects =
    inserted && typeof inserted === "object" && "user_id" in inserted
      ? ((inserted as { user_id?: string | null }).user_id ?? userIdResolved)
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
        ? (subscriptionFrequencyRaw as SubscriptionFrequency)
        : null;
    if (subscriptionFrequency && userIdResolved && locked?.date && locked.time) {
      await createSubscriptionFromBooking({
        admin: supabase,
        userId: userIdResolved,
        serviceType: String(row.service ?? "cleaning"),
        frequency: subscriptionFrequency,
        dateYmd: locked.date,
        timeSlot: locked.time,
        address: String(row.location ?? ""),
        pricePerVisit: Number(row.total_paid_zar ?? Math.round(input.amountCents / 100)),
        cityId,
        paystackCustomerCode: input.paystackCustomerCode ?? null,
        authorizationCode: input.paystackAuthorizationCode ?? null,
        paymentDate: input.paidAtIso ?? null,
      });
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

  return { skipped: false, bookingId: id };
}
