import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { countPaidBookingsForCustomer, resolveReferrerFromCode } from "@/lib/referrals/server";

const REFERRAL_CHECKOUT_DISCOUNT_ZAR = 50;

export type ValidateReferralForCheckoutResult =
  | { valid: false }
  | {
      valid: true;
      discountZar: number;
      normalizedCode: string;
      referrerType: "customer" | "cleaner";
      referrerId: string;
    };

type ReferralCodeLimits = {
  expiresAtIso: string | null;
  maxUses: number | null;
};

async function loadReferralCodeLimitsForReferrer(
  admin: SupabaseClient,
  normalizedCode: string,
  referrerType: "customer" | "cleaner",
  referrerId: string,
): Promise<ReferralCodeLimits | null> {
  if (referrerType === "customer") {
    const { data, error } = await admin
      .from("user_profiles")
      .select("referral_code, referral_code_expires_at, referral_code_max_uses")
      .eq("id", referrerId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      referral_code?: string | null;
      referral_code_expires_at?: string | null;
      referral_code_max_uses?: number | null;
    };
    if (String(row.referral_code ?? "").trim().toUpperCase() !== normalizedCode) return null;
    return {
      expiresAtIso: row.referral_code_expires_at ?? null,
      maxUses: row.referral_code_max_uses != null && Number.isFinite(Number(row.referral_code_max_uses))
        ? Math.max(0, Math.round(Number(row.referral_code_max_uses)))
        : null,
    };
  }
  const { data, error } = await admin
    .from("cleaners")
    .select("referral_code, referral_code_expires_at, referral_code_max_uses")
    .eq("id", referrerId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    referral_code?: string | null;
    referral_code_expires_at?: string | null;
    referral_code_max_uses?: number | null;
  };
  if (String(row.referral_code ?? "").trim().toUpperCase() !== normalizedCode) return null;
  return {
    expiresAtIso: row.referral_code_expires_at ?? null,
    maxUses: row.referral_code_max_uses != null && Number.isFinite(Number(row.referral_code_max_uses))
      ? Math.max(0, Math.round(Number(row.referral_code_max_uses)))
      : null,
  };
}

/**
 * Server-only: whether a checkout referral code may reduce the Paystack amount (soft checks).
 * Final spend control: unique indexes + {@link recordReferralCheckoutRedemption} on payment success.
 */
export async function validateReferralForCheckout(params: {
  admin: SupabaseClient;
  code: string;
  userId?: string | null;
  customerEmail: string;
}): Promise<ValidateReferralForCheckoutResult> {
  const normalized = params.code.trim().toUpperCase();
  if (!normalized) return { valid: false };

  const referrer = await resolveReferrerFromCode(params.admin, normalized);
  if (!referrer) return { valid: false };

  const uid = typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : null;
  if (uid && uid === referrer.referrerId) {
    return { valid: false };
  }

  const email = normalizeEmail(params.customerEmail || "");
  const priorPaid = await countPaidBookingsForCustomer(params.admin, uid, email);
  if (priorPaid > 0) {
    return { valid: false };
  }

  const limits = await loadReferralCodeLimitsForReferrer(params.admin, normalized, referrer.referrerType, referrer.referrerId);
  if (!limits) return { valid: false };

  if (limits.expiresAtIso) {
    const exp = new Date(limits.expiresAtIso);
    if (!Number.isNaN(exp.getTime()) && Date.now() > exp.getTime()) {
      return { valid: false };
    }
  }

  if (limits.maxUses != null && limits.maxUses > 0) {
    const { count, error: ctErr } = await params.admin
      .from("referral_discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("referral_code", normalized);
    if (ctErr) return { valid: false };
    if ((count ?? 0) >= limits.maxUses) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    discountZar: REFERRAL_CHECKOUT_DISCOUNT_ZAR,
    normalizedCode: normalized,
    referrerType: referrer.referrerType,
    referrerId: referrer.referrerId,
  };
}

async function markBookingReferralReconciliationRequired(admin: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await admin.from("bookings").update({ referral_reconciliation_required: true }).eq("id", bookingId);
  if (error) {
    await reportOperationalIssue("error", "referrals/markBookingReferralReconciliationRequired", error.message, {
      bookingId,
    });
  }
}

export type RecordReferralCheckoutRedemptionResult =
  | { outcome: "skipped" }
  | { outcome: "inserted" }
  | { outcome: "idempotent_duplicate_verify" }
  | { outcome: "unique_conflict_reconciled" }
  | { outcome: "insert_failed_reconciled"; message: string };

/**
 * After Paystack success and booking row exists — persists redemption (DB is source of truth).
 * Duplicate verify: unique on `booking_id` → idempotent success.
 * Other unique violations (code/user/fingerprint): payment may have over-committed discount → flag booking.
 */
export async function recordReferralCheckoutRedemption(params: {
  admin: SupabaseClient;
  metadata: Record<string, string | undefined>;
  bookingId: string;
  userId: string | null;
  customerEmail: string;
}): Promise<RecordReferralCheckoutRedemptionResult> {
  if (params.metadata.referral_checkout_applied !== "1") {
    return { outcome: "skipped" };
  }

  const lockAt = String(params.metadata.referral_lock_validated_at ?? "").trim();
  if (!lockAt || !/^\d+$/.test(lockAt)) {
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", "missing referral_lock_validated_at", {
      bookingId: params.bookingId,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "insert_failed_reconciled", message: "missing_referral_lock" };
  }

  const code = String(params.metadata.referral_checkout_code ?? "").trim().toUpperCase();
  const refType = String(params.metadata.referral_checkout_referrer_type ?? "").trim();
  const refId = String(params.metadata.referral_checkout_referrer_id ?? "").trim();
  const discRaw = String(params.metadata.referral_checkout_discount_zar ?? String(REFERRAL_CHECKOUT_DISCOUNT_ZAR));
  const metaReferral = String(params.metadata.referral_code ?? "").trim().toUpperCase();
  if (!code || (refType !== "customer" && refType !== "cleaner") || !/^[0-9a-f-]{36}$/i.test(refId)) {
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "insert_failed_reconciled", message: "invalid_referral_metadata" };
  }
  if (metaReferral && metaReferral !== code) {
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", "referral_code mismatch vs checkout snapshot", {
      bookingId: params.bookingId,
      metaReferral,
      code,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "insert_failed_reconciled", message: "referral_code_mismatch" };
  }

  const discountZar = Math.max(1, Math.round(Number(discRaw)) || REFERRAL_CHECKOUT_DISCOUNT_ZAR);
  const email = normalizeEmail(params.customerEmail);
  const redeemedEmail = params.userId ? null : email || null;
  const fp = String(params.metadata.referral_checkout_fingerprint ?? "").trim() || null;

  const { error } = await params.admin.from("referral_discount_redemptions").insert({
    referral_code: code,
    referrer_type: refType,
    referrer_id: refId,
    redeemed_by_user_id: params.userId,
    redeemed_by_email: redeemedEmail,
    booking_id: params.bookingId,
    discount_zar: discountZar,
    checkout_fingerprint: fp && fp.length > 0 ? fp : null,
  });

  if (!error) {
    return { outcome: "inserted" };
  }

  if (error.code === "23505") {
    const { data: byBooking } = await params.admin
      .from("referral_discount_redemptions")
      .select("id")
      .eq("booking_id", params.bookingId)
      .maybeSingle();
    if (byBooking?.id) {
      return { outcome: "idempotent_duplicate_verify" };
    }
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", "23505 not booking-scoped", {
      bookingId: params.bookingId,
      referralCode: code,
      hint: error.message,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "unique_conflict_reconciled" };
  }

  if (error.code === "23514" || /referral_code_expired|referral_code_max_uses_reached/i.test(error.message ?? "")) {
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", error.message ?? "limit", {
      bookingId: params.bookingId,
      referralCode: code,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "insert_failed_reconciled", message: error.message ?? "limit_violation" };
  }

  await reportOperationalIssue("error", "referrals/recordReferralCheckoutRedemption", error.message, {
    bookingId: params.bookingId,
    referralCode: code,
  });
  await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
  return { outcome: "insert_failed_reconciled", message: error.message };
}
