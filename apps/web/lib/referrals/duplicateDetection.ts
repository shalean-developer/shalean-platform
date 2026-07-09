import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/** Block checkout when this device fingerprint already redeemed this code under another identity. */
export async function isReferralFingerprintBlocked(params: {
  admin: SupabaseClient;
  referralCode: string;
  fingerprint: string | null;
  customerEmail: string;
  userId: string | null;
}): Promise<boolean> {
  const fp = String(params.fingerprint ?? "").trim();
  const code = params.referralCode.trim().toUpperCase();
  if (!fp || !code) return false;

  const email = normalizeEmail(params.customerEmail);
  const uid = params.userId;

  const { data: existing } = await params.admin
    .from("referral_discount_redemptions")
    .select("redeemed_by_email, redeemed_by_user_id")
    .eq("referral_code", code)
    .eq("checkout_fingerprint", fp)
    .limit(1)
    .maybeSingle();

  if (!existing) return false;

  const existingEmail = normalizeEmail(
    String((existing as { redeemed_by_email?: string | null }).redeemed_by_email ?? ""),
  );
  const existingUserId = (existing as { redeemed_by_user_id?: string | null }).redeemed_by_user_id;

  if (uid && existingUserId && String(existingUserId) === uid) return false;
  if (email && existingEmail && email === existingEmail) return false;
  return true;
}

/** Detect multiple distinct emails sharing a fingerprint on the same referral code (last 30 days). */
export async function loadDuplicateFingerprintAlerts(
  admin: SupabaseClient,
  limit = 25,
): Promise<
  Array<{
    referralCode: string;
    checkoutFingerprint: string;
    distinctIdentities: number;
    redemptionCount: number;
  }>
> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("referral_discount_redemptions")
    .select("referral_code, checkout_fingerprint, redeemed_by_email, redeemed_by_user_id, created_at")
    .not("checkout_fingerprint", "is", null)
    .gte("created_at", since)
    .limit(2000);

  const groups = new Map<string, { emails: Set<string>; count: number; code: string; fp: string }>();
  for (const row of data ?? []) {
    const r = row as {
      referral_code?: string;
      checkout_fingerprint?: string;
      redeemed_by_email?: string | null;
      redeemed_by_user_id?: string | null;
    };
    const code = String(r.referral_code ?? "").trim().toUpperCase();
    const fp = String(r.checkout_fingerprint ?? "").trim();
    if (!code || !fp) continue;
    const key = `${code}:${fp}`;
    const g = groups.get(key) ?? { emails: new Set<string>(), count: 0, code, fp };
    const email = normalizeEmail(String(r.redeemed_by_email ?? ""));
    const uid = r.redeemed_by_user_id ? String(r.redeemed_by_user_id) : "";
    if (email) g.emails.add(`e:${email}`);
    else if (uid) g.emails.add(`u:${uid}`);
    g.count += 1;
    groups.set(key, g);
  }

  return [...groups.values()]
    .filter((g) => g.emails.size > 1)
    .map((g) => ({
      referralCode: g.code,
      checkoutFingerprint: g.fp,
      distinctIdentities: g.emails.size,
      redemptionCount: g.count,
    }))
    .sort((a, b) => b.distinctIdentities - a.distinctIdentities)
    .slice(0, limit);
}
