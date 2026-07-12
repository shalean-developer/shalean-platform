/** Pure helpers — no React Native imports (safe for node:test). */

const DEFAULT_ORIGIN = "https://shalean.co.za";

/** Web invite landing — same query shape as account ReferralSharePanel. */
export function buildReferralInviteUrl(
  referralCode: string,
  origin: string = DEFAULT_ORIGIN,
): string {
  const code = referralCode.trim();
  const base = (origin || DEFAULT_ORIGIN).replace(/\/$/, "");
  return `${base}/refer?ref=${encodeURIComponent(code)}`;
}

export function buildReferralShareMessage(inviteUrl: string): string {
  return `Hey! I've been using Shalean Cleaning Services and they're great. Use my referral link to get a discount on your first booking: ${inviteUrl}`;
}
