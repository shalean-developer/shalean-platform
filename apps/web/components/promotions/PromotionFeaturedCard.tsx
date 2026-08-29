"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { PromotionCountdown } from "./PromotionCountdown";
import { promoBookingHref, trackPromoEvent } from "./promoCta";

type DisplayPromo = {
  id: string;
  headline: string;
  subheadline?: string | null;
  cta: string;
  landingPagePath: string;
  offerLabel?: string;
  promoCode: string | null;
  endsAt: string | null;
  countdown?: boolean;
  heroImageUrl?: string | null;
  colours?: { primary?: string; accent?: string };
};

/** Featured promotion card for homepage / marketing sections. */
export function PromotionFeaturedCard() {
  const [promo, setPromo] = useState<DisplayPromo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/promotions?surface=featured");
        if (!res.ok) return;
        const j = (await res.json()) as { promotions?: DisplayPromo[] };
        const first = j.promotions?.[0];
        if (!first) return;
        setPromo(first);
        void fetch("/api/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promotionId: first.id, eventType: "view" }),
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!promo) return null;

  const primary = promo.colours?.primary ?? "#0f172a";
  const accent = promo.colours?.accent ?? "#059669";

  return (
    <HomeSection containerSize="marketing" className="py-[var(--ui-space-8)] md:py-[var(--ui-space-10)]">
      <div
        className="overflow-hidden rounded-[var(--ui-radius-marketing)] text-white shadow-[var(--ui-shadow-md)]"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${accent})`,
        }}
      >
        <div className="grid gap-[var(--ui-space-6)] p-[var(--ui-space-6)] md:grid-cols-[1.2fr_0.8fr] md:p-[var(--ui-space-10)]">
          <div>
            <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.16em] text-white/80">
              Featured promotion
            </p>
            {promo.offerLabel ? (
              <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight">
                {promo.offerLabel}
              </p>
            ) : null}
            <h2 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)]">
              {promo.headline}
            </h2>
            {promo.subheadline ? (
              <p className="mt-[var(--ui-space-3)] max-w-xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-white/90">
                {promo.subheadline}
              </p>
            ) : null}
            {promo.promoCode ? (
              <p className="mt-[var(--ui-space-4)] inline-flex rounded-[var(--ui-radius-pill)] bg-white/15 px-[var(--ui-space-3)] py-[var(--ui-space-1)] font-mono text-[length:var(--ui-text-small)]">
                {promo.promoCode}
              </p>
            ) : null}
            {promo.countdown ? (
              <PromotionCountdown endsAt={promo.endsAt} className="pt-[var(--ui-space-4)]" />
            ) : null}
            <div className="mt-[var(--ui-space-5)] flex flex-wrap gap-[var(--ui-space-3)]">
              <Link
                href={promoBookingHref(promo.promoCode)}
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-lg)] bg-white px-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => trackPromoEvent(promo.id, "click")}
              >
                {promo.cta || "Book now"}
              </Link>
              <Link
                href={promo.landingPagePath}
                className="inline-flex min-h-12 items-center justify-center rounded-[var(--ui-radius-lg)] border border-white/40 bg-white/10 px-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => trackPromoEvent(promo.id, "landing_visit")}
              >
                Learn more
              </Link>
            </div>
          </div>
          {promo.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={promo.heroImageUrl}
              alt=""
              className="h-48 w-full rounded-[var(--ui-radius-2xl)] object-cover md:h-full"
            />
          ) : (
            <div className="flex min-h-[12rem] items-center justify-center rounded-[var(--ui-radius-2xl)] bg-white/10 text-[length:var(--ui-text-small)] text-white/80">
              Shalean Campaign
            </div>
          )}
        </div>
      </div>
    </HomeSection>
  );
}
