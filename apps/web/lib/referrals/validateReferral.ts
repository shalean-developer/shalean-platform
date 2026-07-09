import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  emitReferralCheckoutRedemptionEvents,
  type ReferralRedemptionSnapshot,
} from "@/lib/referrals/referralCheckoutEvents";
import { countQualifyingBookingsForCustomer, resolveReferrerFromCode } from "@/lib/referrals/server";
import { getReferralProgramSettingsCached } from "@/lib/referrals/settings";
import {
  isServiceEligibleForReferral,
  meetsMinBookingValue,
} from "@/lib/referrals/programEnforcement";
import { isValidReferralCodeFormat } from "@/lib/referrals/referralCode";
import { isReferralFingerprintBlocked } from "@/lib/referrals/duplicateDetection";
import type { ReferralCheckoutInvalidReason } from "@/lib/referrals/referralCheckoutReasons";

const DEFAULT_CHECKOUT_DISCOUNT_ZAR = 50;

export type ValidateReferralForCheckoutResult =
  | { valid: false; reason: ReferralCheckoutInvalidReason }
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
  /** Pre-discount booking total in ZAR — required when min_booking_value_zar > 0. */
  bookingTotalZar?: number | null;
  /** Service slug for eligible_service_categories check. */
  serviceSlug?: string | null;
  /** Device fingerprint from IP + User-Agent (guest abuse prevention). */
  checkoutFingerprint?: string | null;
}): Promise<ValidateReferralForCheckoutResult> {
  const normalized = params.code.trim().toUpperCase();
  if (!normalized) return { valid: false, reason: "invalid_format" };
  if (!isValidReferralCodeFormat(normalized)) return { valid: false, reason: "invalid_format" };

  const referrer = await resolveReferrerFromCode(params.admin, normalized);
  if (!referrer) return { valid: false, reason: "code_not_found" };

  const uid = typeof params.userId === "string" && params.userId.trim() ? params.userId.trim() : null;
  if (uid && uid === referrer.referrerId) {
    return { valid: false, reason: "self_referral" };
  }

  const email = normalizeEmail(params.customerEmail || "");
  const priorPaid = await countQualifyingBookingsForCustomer(params.admin, uid, email, "paid");
  if (priorPaid > 0) {
    return { valid: false, reason: "not_first_booking" };
  }

  const limits = await loadReferralCodeLimitsForReferrer(params.admin, normalized, referrer.referrerType, referrer.referrerId);
  if (!limits) return { valid: false, reason: "code_not_found" };

  if (limits.expiresAtIso) {
    const exp = new Date(limits.expiresAtIso);
    if (!Number.isNaN(exp.getTime()) && Date.now() > exp.getTime()) {
      return { valid: false, reason: "code_expired" };
    }
  }

  if (limits.maxUses != null && limits.maxUses > 0) {
    const { count, error: ctErr } = await params.admin
      .from("referral_discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("referral_code", normalized);
    if (ctErr) return { valid: false, reason: "code_not_found" };
    if ((count ?? 0) >= limits.maxUses) {
      return { valid: false, reason: "max_uses_reached" };
    }
  }

  const settings = await getReferralProgramSettingsCached(params.admin);
  if (!settings.enabled) return { valid: false, reason: "program_disabled" };

  if (!isServiceEligibleForReferral(params.serviceSlug, settings)) {
    return { valid: false, reason: "service_ineligible" };
  }

  const bookingTotal = Number(params.bookingTotalZar ?? 0);
  if (!meetsMinBookingValue(bookingTotal, settings)) {
    return { valid: false, reason: "min_booking_not_met" };
  }

  if (
    await isReferralFingerprintBlocked({
      admin: params.admin,
      referralCode: normalized,
      fingerprint: params.checkoutFingerprint ?? null,
      customerEmail: email,
      userId: uid,
    })
  ) {
    return { valid: false, reason: "device_already_used" };
  }

  return {
    valid: true,
    discountZar: Math.round(settings.checkoutDiscountZar),
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

async function fetchReferralRedemptionSnapshotForEmit(
  admin: SupabaseClient,
  bookingId: string,
): Promise<ReferralRedemptionSnapshot | null> {
  const { data, error } = await admin
    .from("referral_discount_redemptions")
    .select("id, booking_id, referral_code, referrer_type, referrer_id, discount_zar, redeemed_by_user_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    booking_id: string;
    referral_code?: string | null;
    referrer_type?: string | null;
    referrer_id?: string | null;
    discount_zar?: number | null;
    redeemed_by_user_id?: string | null;
  };
  const rt = row.referrer_type === "customer" || row.referrer_type === "cleaner" ? row.referrer_type : null;
  if (!rt || !row.referrer_id) return null;
  return {
    redemptionId: row.id,
    bookingId: row.booking_id,
    referralCode: String(row.referral_code ?? "").trim().toUpperCase(),
    referrerId: String(row.referrer_id),
    referrerType: rt,
    refereeUserId: row.redeemed_by_user_id ? String(row.redeemed_by_user_id) : null,
    valueZar: Math.max(0, Math.round(Number(row.discount_zar ?? 0))),
  };
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
  const discRaw = String(params.metadata.referral_checkout_discount_zar ?? String(DEFAULT_CHECKOUT_DISCOUNT_ZAR));
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

  const discountZar = Math.max(1, Math.round(Number(discRaw)) || DEFAULT_CHECKOUT_DISCOUNT_ZAR);
  const email = normalizeEmail(params.customerEmail);
  const redeemedEmail = params.userId ? null : email || null;
  const fp = String(params.metadata.referral_checkout_fingerprint ?? "").trim() || null;

  const { data: inserted, error: insertError } = await params.admin
    .from("referral_discount_redemptions")
    .insert({
      referral_code: code,
      referrer_type: refType,
      referrer_id: refId,
      redeemed_by_user_id: params.userId,
      redeemed_by_email: redeemedEmail,
      booking_id: params.bookingId,
      discount_zar: discountZar,
      checkout_fingerprint: fp && fp.length > 0 ? fp : null,
    })
    .select("id")
    .maybeSingle();

  if (!insertError && inserted?.id) {
    await emitReferralCheckoutRedemptionEvents(params.admin, {
      redemptionId: inserted.id,
      bookingId: params.bookingId,
      referralCode: code,
      referrerId: refId,
      referrerType: refType as "customer" | "cleaner",
      refereeUserId: params.userId,
      valueZar: discountZar,
    });
    return { outcome: "inserted" };
  }

  if (insertError?.code === "23505") {
    const { data: byBooking } = await params.admin
      .from("referral_discount_redemptions")
      .select("id")
      .eq("booking_id", params.bookingId)
      .maybeSingle();
    if (byBooking?.id) {
      const snap = await fetchReferralRedemptionSnapshotForEmit(params.admin, params.bookingId);
      if (snap) await emitReferralCheckoutRedemptionEvents(params.admin, snap);
      return { outcome: "idempotent_duplicate_verify" };
    }
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", "23505 not booking-scoped", {
      bookingId: params.bookingId,
      referralCode: code,
      hint: insertError.message,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "unique_conflict_reconciled" };
  }

  if (
    insertError?.code === "23514" ||
    /referral_code_expired|referral_code_max_uses_reached/i.test(insertError?.message ?? "")
  ) {
    await reportOperationalIssue("warn", "referrals/recordReferralCheckoutRedemption", insertError?.message ?? "limit", {
      bookingId: params.bookingId,
      referralCode: code,
    });
    await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
    return { outcome: "insert_failed_reconciled", message: insertError?.message ?? "limit_violation" };
  }

  await reportOperationalIssue("error", "referrals/recordReferralCheckoutRedemption", insertError?.message ?? "unknown", {
    bookingId: params.bookingId,
    referralCode: code,
  });
  await markBookingReferralReconciliationRequired(params.admin, params.bookingId);
  return { outcome: "insert_failed_reconciled", message: insertError?.message ?? "unknown" };
}
