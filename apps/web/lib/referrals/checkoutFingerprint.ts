import "server-only";

import crypto from "crypto";

export type CheckoutTrustSignals = {
  clientIp?: string | null;
  userAgent?: string | null;
};

/**
 * Stable, non-reversible fingerprint for referral checkout abuse limits (guest / device).
 * Returns null when there is nothing meaningful to hash (skips DB unique on fingerprint).
 */
export function buildReferralCheckoutFingerprint(signals: CheckoutTrustSignals | undefined): string | null {
  const ip = typeof signals?.clientIp === "string" ? signals.clientIp.trim() : "";
  const ua = typeof signals?.userAgent === "string" ? signals.userAgent.trim().slice(0, 512) : "";
  if (!ip && !ua) return null;
  return crypto.createHash("sha256").update(`${ip}|${ua}`, "utf8").digest("hex");
}
