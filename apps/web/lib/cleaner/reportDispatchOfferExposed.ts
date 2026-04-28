"use client";

import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";

/**
 * First-visible exposure metric (`dispatch.offer.exposed`). Deduped client-side after HTTP 200.
 */
export function reportDispatchOfferExposed(offerId: string, headers: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const key = `dispatch_offer_exposed:${offerId}`;
  try {
    if (sessionStorage.getItem(key)) return;
  } catch {
    return;
  }
  void cleanerAuthenticatedFetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/exposed`, {
    method: "POST",
    headers: { ...headers },
  })
    .then((res) => {
      if (!res.ok) return;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    })
    .catch(() => {});
}
