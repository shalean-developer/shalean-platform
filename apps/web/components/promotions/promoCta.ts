/** Shared public promo CTA destinations and tracking. */

export function promoBookingHref(promoCode?: string | null): string {
  const code = promoCode?.trim();
  if (code) return `/book?promo=${encodeURIComponent(code)}`;
  return "/book";
}

export function trackPromoEvent(
  promotionId: string,
  eventType: "click" | "landing_visit",
): void {
  void fetch("/api/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ promotionId, eventType }),
  });
}
