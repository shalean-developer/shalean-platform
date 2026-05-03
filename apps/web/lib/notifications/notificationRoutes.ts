import { isValidOfferTokenFormat } from "@/lib/dispatch/offerTokenFormat";
import type { CleanerNotificationKind } from "@/lib/notifications/types";

/**
 * In-app + system notification default targets by kind (Johannesburg product surface).
 * When `offerToken` is a valid dispatch offer UUID, `job_offer` opens the same page as SMS (`/offer/{token}`).
 */
export function hrefForNotificationKind(
  kind: CleanerNotificationKind | undefined,
  bookingId?: string | null,
  offerToken?: string | null,
): string {
  switch (kind) {
    case "job_assigned": {
      const bid = String(bookingId ?? "").trim();
      return bid ? `/cleaner/jobs/${encodeURIComponent(bid)}` : "/cleaner/jobs";
    }
    case "payout_failed":
      return "/cleaner/profile";
    case "job_offer": {
      const t = String(offerToken ?? "").trim();
      if (t && isValidOfferTokenFormat(t)) return `/offer/${encodeURIComponent(t)}`;
      return "/cleaner/dashboard";
    }
    case "system":
    default:
      return "/cleaner/dashboard";
  }
}