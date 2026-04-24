import { getServiceLabel } from "@/components/booking/serviceCategories";
import { validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import { resolveRatesSnapshotForLockedBooking } from "@/lib/booking/resolveRatesSnapshot";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";
import { runAdminAssignSmart } from "@/lib/admin/runAdminAssignSmart";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getDemandSupplySnapshotByCity, getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { createPendingCustomerReferral } from "@/lib/referrals/server";
import { createSubscriptionFromBooking, type SubscriptionFrequency } from "@/lib/subscriptions/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { pickUserSelectedCleanerId } from "@/lib/booking/userSelectedCleanerFromSnapshot";

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
};

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
    .select("id, status")
    .eq("paystack_reference", input.paystackReference)
    .maybeSingle();

  if (selectErr) {
    await reportOperationalIssue("error", "upsertBookingFromPaystack", `select failed: ${selectErr.message}`, {
      paystackReference: input.paystackReference,
    });
    return { skipped: true, bookingId: null, error: selectErr.message };
  }

  let existingPendingPaymentId: string | null = null;
  if (existing && typeof existing === "object" && "id" in existing) {
    const st = String((existing as { status?: string }).status ?? "");
    if (st !== "pending_payment") {
      return { skipped: true, bookingId: String((existing as { id: string }).id) };
    }
    existingPendingPaymentId = String((existing as { id: string }).id);
  }

  const locked = input.snapshot?.locked;
  const lockedRow = parseLockedBookingFromUnknown(locked ?? null);

  const pickedCleanerUuid = pickUserSelectedCleanerId(lockedRow, input.snapshot);
  let userConfirmedCleanerId: string | null = null;
  if (pickedCleanerUuid) {
    const { data: cleanerHit, error: cleanerLookupErr } = await supabase
      .from("cleaners")
      .select("id")
      .eq("id", pickedCleanerUuid)
      .maybeSingle();
    if (!cleanerLookupErr && cleanerHit && typeof cleanerHit === "object" && "id" in cleanerHit) {
      userConfirmedCleanerId = String((cleanerHit as { id: string }).id);
    }
  }
  /** Customer had a UUID in snapshot/lock but it did not match a `cleaners` row — auto dispatch uses `auto_fallback`. */
  const selectionInvalidatedCleaner = Boolean(pickedCleanerUuid && !userConfirmedCleanerId);

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

  const assignedAtIso = new Date().toISOString();
  const userSelectedRow =
    userConfirmedCleanerId != null
      ? {
          cleaner_id: userConfirmedCleanerId,
          selected_cleaner_id: userConfirmedCleanerId,
          assignment_type: "user_selected",
          status: "assigned",
          dispatch_status: "assigned",
          assigned_at: assignedAtIso,
        }
      : {};

  const row = {
    paystack_reference: input.paystackReference,
    customer_email: emailStored,
    customer_name: cust?.name?.trim() || null,
    customer_phone: cust?.phone?.trim() || null,
    user_id: userIdResolved,
    amount_paid_cents: input.amountCents,
    currency: input.currency || "ZAR",
    booking_snapshot: bookingSnapshotMerged,
    status: "pending",
    dispatch_status: "searching",
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

    /** Customer-picked cleaner: already on row — notify only; skip smart dispatch. */
    if (userConfirmedCleanerId) {
      try {
        await notifyCleanerAssignedBooking(supabase, id, userConfirmedCleanerId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await reportOperationalIssue("error", "upsertBookingFromPaystack", `notify assigned (user_selected): ${msg}`, {
          bookingId: id,
          paystackReference: input.paystackReference,
        });
      }
    } else {
      const autoAssignmentTag = selectionInvalidatedCleaner ? "auto_fallback" : "auto_dispatch";
      /** Smart dispatch unless explicitly disabled (`AUTO_DISPATCH_CLEANERS=false`). */
      const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
      const offerAssignFallback = process.env.CHECKOUT_ADMIN_OFFER_ASSIGN_FALLBACK === "true";
      if (autoDispatch) {
        const r = await ensureBookingAssignment(supabase, id, { source: "paystack_checkout" });
        if (r.ok) {
          await supabase
            .from("bookings")
            .update({ assignment_type: autoAssignmentTag })
            .eq("id", id)
            .is("assignment_type", null);
          await notifyCleanerAssignedBooking(supabase, id, r.cleanerId);
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
              .update({ assignment_type: autoAssignmentTag })
              .eq("id", id)
              .is("assignment_type", null);
            await notifyCleanerAssignedBooking(supabase, id, smart.cleanerId);
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
            .update({ assignment_type: autoAssignmentTag })
            .eq("id", id)
            .is("assignment_type", null);
          await notifyCleanerAssignedBooking(supabase, id, smart.cleanerId);
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
  }

  return { skipped: false, bookingId: id };
}
