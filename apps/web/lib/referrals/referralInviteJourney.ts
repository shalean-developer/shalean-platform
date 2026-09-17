export type ReferralAuthMode = "signup" | "login";

/**
 * Sends invited visitors through normal customer authentication, then back to
 * booking with the captured referral code preserved in the redirect URL.
 */
export function buildReferralAuthHref(mode: ReferralAuthMode, bookingHref: string): string {
  const redirect = bookingHref.startsWith("/") ? bookingHref : "/book";
  const params = new URLSearchParams({
    redirect,
    intent: "customer",
  });
  return `/auth/${mode}?${params.toString()}`;
}
