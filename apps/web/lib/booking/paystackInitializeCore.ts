import "server-only";

import crypto from "crypto";

import { computeCheckoutTotalZar, MAX_TIP_ZAR } from "@/lib/booking/checkoutTotal";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingCustomerAuthType } from "@/lib/booking/paystackChargeTypes";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import { verifySupabaseAccessToken } from "@/lib/booking/verifySupabaseSession";
import { validateLockForCheckout } from "@/lib/booking/checkoutLockValidation";
import {
  deletePendingPaymentBooking,
  deleteRecentPendingPaymentsForEmail,
  insertPendingPaymentBookingRow,
  updatePendingPaymentBookingForInit,
} from "@/lib/booking/insertPendingPaymentBooking";
import { metrics } from "@/lib/metrics/counters";
import { resolveRatesSnapshotForLockedBooking } from "@/lib/booking/resolveRatesSnapshot";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";
import { buildSnapshotFlat, mergeSnapshotWithFlat } from "@/lib/booking/snapshotFlat";
import { getDemandSupplySnapshotByCity, getSurgeLabel } from "@/lib/pricing/demandSupplySurge";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE } from "@/lib/booking/paystackErrorCodes";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export { PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE };

function boolishInit(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === "string") return ["1", "true", "yes"].includes(raw.trim().toLowerCase());
  return false;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function buildBookingSnapshot(params: {
  locked: LockedBooking;
  tip: number;
  discountZar: number;
  promoCode: string;
  totalZar: number;
  cleanerId: string | null;
  cleanerName: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    user_id: string | null;
    type: BookingCustomerAuthType;
  };
  subscriptionFrequency: "weekly" | "biweekly" | "monthly" | null;
}) {
  return {
    v: 1,
    locked: params.locked,
    tip_zar: params.tip,
    discount_zar: params.discountZar,
    promo_code: params.promoCode || null,
    total_zar: params.totalZar,
    cleaner_id: params.cleanerId,
    cleaner_name: params.cleanerName,
    subscription:
      params.subscriptionFrequency != null
        ? { frequency: params.subscriptionFrequency, discount_zar: params.discountZar }
        : null,
    customer: params.customer,
  };
}

function isNonEmptyContact(name: string, email: string, phone: string): boolean {
  return (
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    phone.trim().length >= 5
  );
}

export type PaystackInitializeSuccess = {
  ok: true;
  authorizationUrl: string;
  reference: string;
  /** `pending_payment` row id (new insert or existing `bookingId` / `booking_id` body). */
  bookingId?: string | null;
};

/** Returned in JSON as `errorCode` for client UX (never show raw lock validation strings). */
export type PaystackInitializeFailure = {
  ok: false;
  status: number;
  /** Safe, non-technical message for clients that display `error` verbatim */
  error: string;
  errorCode?:
    | typeof PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE
    | "AMOUNT_MISMATCH"
    | "SESSION_EXPIRED"
    | "VALIDATION"
    | "LOCK_EXPIRED"
    | "REQUOTE_REQUIRED"
    | "SIGNATURE_INVALID"
    | "PRICE_MISMATCH"
    | "DURATION_MISMATCH"
    | "PRICING_SNAPSHOT_MISSING"
    | "PAYSTACK_SECRET_MISSING";
};

/**
 * Shared Paystack initialize logic for `/api/paystack/initialize` and AI booking confirm.
 */
export async function processPaystackInitializeBody(
  b: Record<string, unknown>,
): Promise<PaystackInitializeSuccess | PaystackInitializeFailure> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    console.error("[paystack] Missing PAYSTACK_SECRET_KEY.");
    return {
      ok: false,
      status: 503,
      errorCode: "PAYSTACK_SECRET_MISSING",
      error: "Something went wrong. Please try again in a moment.",
    };
  }

  const locked = parseLockedBookingFromUnknown(b.locked);
  if (!locked) {
    return {
      ok: false,
      status: 400,
      errorCode: PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE,
      error: "Select a valid time to continue.",
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      errorCode: "PRICING_SNAPSHOT_MISSING",
      error: "Checkout is temporarily unavailable. Please try again in a moment.",
    };
  }
  const ratesSnapshot = await resolveRatesSnapshotForLockedBooking(admin, locked);
  if (!ratesSnapshot) {
    return {
      ok: false,
      status: 400,
      errorCode: "PRICING_SNAPSHOT_MISSING",
      error: "This quote’s pricing record is no longer available. Pick your time again to refresh.",
    };
  }

  const email = normalizeEmail(typeof b.email === "string" ? b.email : "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: "A valid email address is required." };
  }

  const bookingIdFromBody =
    typeof b.bookingId === "string" && b.bookingId.trim()
      ? b.bookingId.trim()
      : typeof b.booking_id === "string" && b.booking_id.trim()
        ? b.booking_id.trim()
        : null;

  let createdPendingBookingId: string | null = null;
  let paystackReferenceOverride: string | null = null;
  if (!bookingIdFromBody) {
    await deleteRecentPendingPaymentsForEmail(admin, email);
    const paystackRef = crypto.randomUUID();
    const ins = await insertPendingPaymentBookingRow(admin, {
      paystackReference: paystackRef,
      locked,
      customerEmail: email,
    });
    if (ins.ok) {
      createdPendingBookingId = ins.id;
      paystackReferenceOverride = paystackRef;
    }
  }

  const checkout = validateLockForCheckout(locked, Date.now(), {
    ratesSnapshot,
    bookingId: bookingIdFromBody ?? createdPendingBookingId,
    skipPriceDurationParity: boolishInit((b as { relaxedLockValidation?: unknown }).relaxedLockValidation),
  });
  if (!checkout.ok) {
    if (createdPendingBookingId) {
      await deletePendingPaymentBooking(admin, createdPendingBookingId);
    }
    const code = checkout.code;
    if (code === "LOCK_EXPIRED") {
      return {
        ok: false,
        status: 400,
        errorCode: "LOCK_EXPIRED",
        error: checkout.message,
      };
    }
    if (code === "REQUOTE_REQUIRED") {
      return { ok: false, status: 400, errorCode: "REQUOTE_REQUIRED", error: checkout.message };
    }
    if (code === "SIGNATURE_INVALID") {
      return { ok: false, status: 400, errorCode: "SIGNATURE_INVALID", error: checkout.message };
    }
    if (code === "PRICE_MISMATCH" || code === "DURATION_MISMATCH") {
      return { ok: false, status: 400, errorCode: code, error: checkout.message };
    }
    if (code === "PRICING_SNAPSHOT_MISSING") {
      return { ok: false, status: 400, errorCode: "PRICING_SNAPSHOT_MISSING", error: checkout.message };
    }
    return {
      ok: false,
      status: 400,
      errorCode: PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE,
      error: checkout.message,
    };
  }

  const visitZar = checkout.visitTotalZar;

  const tip = clamp(Math.round(Number(b.tip) || 0), 0, MAX_TIP_ZAR);

  const promoCode = typeof b.promoCode === "string" ? b.promoCode.trim() : "";
  const promo = promoCode ? getPromoDiscountZar(promoCode, visitZar) : null;
  let discountZar = promo ? promo.discountZar : 0;

  const referralCode = typeof b.referralCode === "string" ? b.referralCode.trim().toUpperCase() : "";
  if (referralCode) {
    discountZar += 50;
  }

  const freq = locked.cleaningFrequency ?? "one_time";
  if (freq === "weekly") {
    discountZar += Math.round(visitZar * 0.1);
  } else if (freq === "biweekly") {
    discountZar += Math.round(visitZar * 0.05);
  }

  /** Server-only — never trust a client-supplied `amount` or `locked.finalPrice` for Paystack. */
  const totalZar = computeCheckoutTotalZar(visitZar, tip, discountZar);
  const amountCents = totalZar * 100;

  const accessToken = typeof b.accessToken === "string" ? b.accessToken.trim() : "";

  const customerRaw = b.customer;
  if (!customerRaw || typeof customerRaw !== "object" || Array.isArray(customerRaw)) {
    return { ok: false, status: 400, error: "Customer details are required." };
  }
  const cr = customerRaw as Record<string, unknown>;
  const authType: BookingCustomerAuthType =
    cr.type === "login" || cr.type === "register" || cr.type === "guest" ? cr.type : "guest";
  const custName = typeof cr.name === "string" ? cr.name.trim() : "";
  const custEmail = normalizeEmail(typeof cr.email === "string" ? cr.email : "");
  const custPhone = typeof cr.phone === "string" ? cr.phone.trim() : "";
  const clientUserId = typeof cr.userId === "string" ? cr.userId.trim() : "";

  if (custEmail !== email) {
    return {
      ok: false,
      status: 400,
      error: "Customer email must match the checkout email used for payment.",
    };
  }

  let customer: {
    name: string;
    email: string;
    phone: string;
    user_id: string | null;
    type: BookingCustomerAuthType;
  };

  if (authType === "guest") {
    if (!isNonEmptyContact(custName, custEmail, custPhone)) {
      return {
        ok: false,
        status: 400,
        error: "Please enter your full name, email, and phone number.",
      };
    }
    customer = {
      name: custName,
      email: custEmail,
      phone: custPhone,
      user_id: null,
      type: "guest",
    };
  } else {
    const verified = await verifySupabaseAccessToken(accessToken);
    if (!verified || verified.id !== clientUserId) {
      return {
        ok: false,
        status: 401,
        errorCode: "SESSION_EXPIRED",
        error: "Your session expired. Sign in again or continue as guest.",
      };
    }
    const sessionEmail = verified.email ? normalizeEmail(verified.email) : "";
    if (!sessionEmail || sessionEmail !== email) {
      return {
        ok: false,
        status: 400,
        error: "Signed-in email must match the checkout email.",
      };
    }
    if (!isNonEmptyContact(custName, custEmail, custPhone)) {
      return {
        ok: false,
        status: 400,
        error: "Please enter your full name, email, and phone number.",
      };
    }
    customer = {
      name: custName,
      email: custEmail,
      phone: custPhone,
      user_id: verified.id,
      type: authType,
    };
  }

  const cleanerId = typeof b.cleanerId === "string" ? b.cleanerId : null;
  const cleanerName = typeof b.cleanerName === "string" ? b.cleanerName.trim() : null;
  const subscriptionFrequency =
    (b as { metadata?: { subscriptionFrequency?: unknown } }).metadata?.subscriptionFrequency === "weekly" ||
    (b as { metadata?: { subscriptionFrequency?: unknown } }).metadata?.subscriptionFrequency === "biweekly" ||
    (b as { metadata?: { subscriptionFrequency?: unknown } }).metadata?.subscriptionFrequency === "monthly"
      ? ((b as { metadata?: { subscriptionFrequency?: "weekly" | "biweekly" | "monthly" } }).metadata?.subscriptionFrequency ?? null)
      : null;

  const snapshot = buildBookingSnapshot({
    locked,
    tip,
    discountZar,
    promoCode,
    totalZar,
    cleanerId,
    cleanerName,
    customer,
    subscriptionFrequency,
  });

  if (createdPendingBookingId && checkout.serverQuote) {
    const flat = buildSnapshotFlat(locked);
    const bookingSnapshotMerged = mergeSnapshotWithFlat(snapshot, flat);
    const locationContext = await resolveLocationContextFromLabel(admin, locked.location?.trim() ?? null);
    const locationId = locationContext.locationId;
    const cityId = locationContext.cityId;
    const ds = await getDemandSupplySnapshotByCity(admin, cityId);
    const lockedSurge = typeof locked.surge === "number" && Number.isFinite(locked.surge) ? locked.surge : ds.multiplier;
    const surgeMultiplier = Math.min(2, Math.max(1, lockedSurge));
    const surgeReason = surgeMultiplier > 1 ? getSurgeLabel(surgeMultiplier) : null;
    const extrasSnapshot = extrasLineItemsFromSnapshot(
      ratesSnapshot,
      locked.extras ?? [],
      locked.service ?? null,
    ).map(({ slug, name, price }) => ({ slug, name, price }));
    const priceBreakdown = { ...checkout.serverQuote, job: checkout.jobSubtotalSplit };
    const upd = await updatePendingPaymentBookingForInit(admin, {
      bookingId: createdPendingBookingId,
      bookingSnapshot: bookingSnapshotMerged,
      priceBreakdown,
      totalPriceZar: checkout.visitTotalZar,
      totalPaidZar: totalZar,
      customerName: customer.name.trim() || null,
      customerPhone: customer.phone.trim() || null,
      userId: customer.user_id,
      locationId,
      cityId,
      surgeMultiplier,
      surgeReason,
      extrasSnapshot,
    });
    if (!upd.ok) {
      await deletePendingPaymentBooking(admin, createdPendingBookingId);
      return {
        ok: false,
        status: 503,
        errorCode: "PRICING_SNAPSHOT_MISSING",
        error: "Could not reserve your booking. Please try again in a moment.",
      };
    }
  }

  const extraMetadata =
    b.metadata !== undefined && b.metadata !== null && typeof b.metadata === "object" && !Array.isArray(b.metadata)
      ? (b.metadata as Record<string, unknown>)
      : {};

  const paystackMetadata: Record<string, string> = {
    booking_json: JSON.stringify(snapshot),
    locked_at: locked.lockedAt,
    tip_zar: String(tip),
    discount_zar: String(discountZar),
    promo_code: promoCode || "",
    locked_final_zar: String(visitZar),
    pay_total_zar: String(totalZar),
    quote_signature: locked.quoteSignature ?? "",
    lock_expires_at: locked.lockExpiresAt ?? "",
    cleaner_id: cleanerId ?? "",
    cleaner_name: cleanerName ?? "",
    referral_code: referralCode || "",
    customer_email: customer.email,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_user_id: customer.user_id ?? "",
    customer_type: customer.type,
  };
  const bookingIdForMetadata = createdPendingBookingId ?? bookingIdFromBody;
  if (bookingIdForMetadata) {
    paystackMetadata.shalean_booking_id = bookingIdForMetadata;
  }

  for (const [k, v] of Object.entries(extraMetadata)) {
    if (k === "booking_json") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      paystackMetadata[`client_${k}`] = String(v);
    }
  }

  const metadataPayload: Record<string, unknown> = {
    ...paystackMetadata,
    userId: customer.user_id ?? "",
    booking: {
      service: locked.service,
      rooms: locked.rooms,
      bathrooms: locked.bathrooms,
      extras: locked.extras,
      location: locked.location,
      date: locked.date,
      time: locked.time,
    },
  };

  const appUrl = getPublicAppUrlBase();
  const callbackUrl = `${appUrl}/booking/success`;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountCents,
      currency: "ZAR",
      ...(paystackReferenceOverride ? { reference: paystackReferenceOverride } : {}),
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      metadata: metadataPayload,
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };

  const authUrl = json.data?.authorization_url;
  const reference = paystackReferenceOverride ?? json.data?.reference;
  if (!json.status || !authUrl || !reference) {
    if (createdPendingBookingId) {
      await deletePendingPaymentBooking(admin, createdPendingBookingId);
    }
    return {
      ok: false,
      status: 502,
      error: json.message || "Could not start Paystack checkout.",
    };
  }

  if (bookingIdFromBody && reference) {
    const { error: refUpdErr } = await admin
      .from("bookings")
      .update({ paystack_reference: reference })
      .eq("id", bookingIdFromBody)
      .eq("status", "pending_payment");
    if (refUpdErr) {
      await reportOperationalIssue("error", "paystackInitializeCore", `paystack_reference update failed: ${refUpdErr.message}`, {
        bookingId: bookingIdFromBody,
        reference,
      });
    }
  }

  if (createdPendingBookingId) {
    metrics.increment("checkout.paystack_reference_map", {
      bookingId: createdPendingBookingId,
      reference,
    });
  }

  return {
    ok: true,
    authorizationUrl: authUrl,
    reference,
    bookingId: createdPendingBookingId ?? bookingIdFromBody,
  };
}
