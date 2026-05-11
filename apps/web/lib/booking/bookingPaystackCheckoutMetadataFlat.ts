/**
 * Canonical Paystack checkout `metadata` string fields shared by
 * {@link processPaystackInitializeBody} (server initialize) and
 * {@link buildInlinePaystackMetadata} (Paystack Inline).
 *
 * Paystack persists flat string metadata only. The DB `bookings` row remains the
 * source of truth for `selected_cleaner_id` / pricing; metadata is for
 * traceability, Paystack dashboards, and finalize fallbacks.
 */

export const PAYSTACK_CHECKOUT_METADATA_CONTRACT_VERSION = "2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePaystackCleanerUuid(raw: string | null | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || !UUID_RE.test(t)) return "";
  return t.toLowerCase();
}

export type CanonicalPaystackCheckoutMetadataInput = {
  payment_path: "server_initialize" | "inline_checkout";
  /** `shalean_booking_id` / `booking_id` when known */
  internalBookingId: string | null;
  booking_json: string;
  booking_snapshot_version: string;
  locked_at: string;
  quote_signature: string;
  lock_expires_at: string;
  /**
   * Authoritative selected cleaner UUID from the booking row or lock (never trust ad‑hoc client id alone).
   * `cleaner_id` in metadata mirrors this for legacy parity with Paystack finalize helpers.
   */
  selected_cleaner_id: string;
  cleaner_name: string;
  assignment_type: string;
  service_slug: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  customer_user_id: string;
  customer_type: string;
  tip_zar: string;
  discount_zar: string;
  promo_code: string;
  locked_final_zar: string;
  pay_total_zar: string;
  expected_total_zar: string;
  price_snapshot: string;
  /** Compact `metadata.booking` context JSON */
  booking: string;
  payment_mode: string;
  attribution_source: string;
  analytics_session_id: string;
};

/**
 * Returns flat string metadata merged for Paystack `transaction/initialize` and Inline SDK.
 * Referral-only keys are appended by the server initialize path after this object.
 */
export function buildCanonicalPaystackCheckoutMetadata(
  input: CanonicalPaystackCheckoutMetadataInput,
): Record<string, string> {
  const sel = normalizePaystackCleanerUuid(input.selected_cleaner_id);
  const id = typeof input.internalBookingId === "string" ? input.internalBookingId.trim() : "";

  const base: Record<string, string> = {
    shalean_checkout_meta_v: PAYSTACK_CHECKOUT_METADATA_CONTRACT_VERSION,
    payment_path: input.payment_path,
    booking_snapshot_version: input.booking_snapshot_version.trim() || "1",
    booking_json: input.booking_json,
    locked_at: input.locked_at.trim() || new Date().toISOString(),
    quote_signature: input.quote_signature,
    lock_expires_at: input.lock_expires_at,
    selected_cleaner_id: sel,
    cleaner_id: sel,
    cleaner_name: input.cleaner_name,
    assignment_type: input.assignment_type,
    service_slug: input.service_slug.trim().toLowerCase(),
    customer_email: input.customer_email,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone,
    customer_user_id: input.customer_user_id,
    customer_type: input.customer_type,
    tip_zar: input.tip_zar,
    discount_zar: input.discount_zar,
    promo_code: input.promo_code,
    locked_final_zar: input.locked_final_zar,
    pay_total_zar: input.pay_total_zar,
    expected_total_zar: input.expected_total_zar,
    price_snapshot: input.price_snapshot,
    booking: input.booking,
    userId: input.customer_user_id,
    payment_mode: input.payment_mode,
    attribution_source: input.attribution_source,
    analytics_session_id: input.analytics_session_id,
    referral_checkout_applied: "0",
    referral_checkout_code: "",
    referral_checkout_referrer_type: "",
    referral_checkout_referrer_id: "",
    referral_checkout_discount_zar: "0",
    referral_lock_validated_at: "",
    referral_checkout_fingerprint: "",
  };

  if (id) {
    base.shalean_booking_id = id;
    base.booking_id = id;
  }

  return base;
}

/** Read lock timing + version from persisted `booking_snapshot` JSON (inline / segmented checkout). */
export function parseLockTimingFromBookingSnapshotJson(bookingSnapshotJson: string | null | undefined): {
  lockedAt: string;
  quoteSignature: string;
  lockExpiresAt: string;
  snapshotVersion: string;
} {
  const raw = typeof bookingSnapshotJson === "string" ? bookingSnapshotJson.trim() : "";
  if (!raw) {
    return {
      lockedAt: new Date().toISOString(),
      quoteSignature: "",
      lockExpiresAt: "",
      snapshotVersion: "1",
    };
  }
  try {
    const o = JSON.parse(raw) as {
      v?: unknown;
      locked?: {
        lockedAt?: unknown;
        quoteSignature?: unknown;
        lockExpiresAt?: unknown;
      };
    };
    const v = o?.v != null && (typeof o.v === "number" || typeof o.v === "string") ? String(o.v) : "1";
    const locked = o?.locked && typeof o.locked === "object" ? o.locked : null;
    const lockedAt =
      locked && typeof locked.lockedAt === "string" && locked.lockedAt.trim()
        ? locked.lockedAt.trim()
        : new Date().toISOString();
    const quoteSignature =
      locked && typeof locked.quoteSignature === "string" ? locked.quoteSignature.trim() : "";
    const lockExpiresAt =
      locked && typeof locked.lockExpiresAt === "string" ? locked.lockExpiresAt.trim() : "";
    return { lockedAt, quoteSignature, lockExpiresAt, snapshotVersion: v };
  } catch {
    return {
      lockedAt: new Date().toISOString(),
      quoteSignature: "",
      lockExpiresAt: "",
      snapshotVersion: "1",
    };
  }
}
