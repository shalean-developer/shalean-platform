import type { SupabaseClient } from "@supabase/supabase-js";

export type BookingReferralCheckoutSnapshot = {
  applied: boolean;
  code: string;
  discountZar: number;
  referrerType: "customer" | "cleaner";
  referrerId: string;
  lockValidatedAt: number;
  checkoutFingerprint?: string | null;
};

export function buildReferralCheckoutSnapshot(
  validation: {
    normalizedCode: string;
    discountZar: number;
    referrerType: "customer" | "cleaner";
    referrerId: string;
  },
  lockValidatedAt = Date.now(),
  checkoutFingerprint?: string | null,
): BookingReferralCheckoutSnapshot {
  return {
    applied: true,
    code: validation.normalizedCode,
    discountZar: validation.discountZar,
    referrerType: validation.referrerType,
    referrerId: validation.referrerId,
    lockValidatedAt,
    checkoutFingerprint: checkoutFingerprint ?? null,
  };
}

function readReferralCheckoutFromSnapshot(snapshot: unknown): BookingReferralCheckoutSnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const raw = (snapshot as { referralCheckout?: unknown }).referralCheckout;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Partial<BookingReferralCheckoutSnapshot>;
  if (row.applied !== true) return null;
  const code = String(row.code ?? "").trim().toUpperCase();
  const referrerType = row.referrerType === "customer" || row.referrerType === "cleaner" ? row.referrerType : null;
  const referrerId = String(row.referrerId ?? "").trim();
  const discountZar = Math.max(0, Math.round(Number(row.discountZar ?? 0)));
  const lockValidatedAt = Math.round(Number(row.lockValidatedAt ?? 0));
  if (!code || !referrerType || !/^[0-9a-f-]{36}$/i.test(referrerId) || discountZar <= 0 || lockValidatedAt <= 0) {
    return null;
  }
  return {
    applied: true,
    code,
    discountZar,
    referrerType,
    referrerId,
    lockValidatedAt,
  };
}

export function referralCheckoutMetadataFromSnapshot(
  snapshot: BookingReferralCheckoutSnapshot,
): Record<string, string> {
  const meta: Record<string, string> = {
    referral_code: snapshot.code,
    referral_checkout_applied: "1",
    referral_checkout_code: snapshot.code,
    referral_checkout_referrer_type: snapshot.referrerType,
    referral_checkout_referrer_id: snapshot.referrerId,
    referral_checkout_discount_zar: String(snapshot.discountZar),
    referral_lock_validated_at: String(snapshot.lockValidatedAt),
  };
  const fp = String(snapshot.checkoutFingerprint ?? "").trim();
  if (fp) meta.referral_checkout_fingerprint = fp;
  return meta;
}

export async function enrichPaystackMetadataWithBookingReferral(
  admin: SupabaseClient,
  bookingId: string,
  metadata: Record<string, string | undefined>,
): Promise<Record<string, string | undefined>> {
  if (metadata.referral_checkout_applied === "1") return metadata;

  const { data, error } = await admin.from("bookings").select("booking_snapshot").eq("id", bookingId).maybeSingle();
  if (error || !data) return metadata;

  const referral = readReferralCheckoutFromSnapshot(
    (data as { booking_snapshot?: unknown }).booking_snapshot,
  );
  if (!referral) return metadata;

  return {
    ...metadata,
    ...referralCheckoutMetadataFromSnapshot(referral),
  };
}
