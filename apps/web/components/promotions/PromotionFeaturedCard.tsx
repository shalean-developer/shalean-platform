"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PromotionCountdown } from "./PromotionCountdown";

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
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div
        className="overflow-hidden rounded-3xl text-white"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${accent})`,
        }}
      >
        <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-10">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
              Featured promotion
            </p>
            {promo.offerLabel ? (
              <p className="text-3xl font-bold tracking-tight md:text-4xl">{promo.offerLabel}</p>
            ) : null}
            <h2 className="text-2xl font-semibold md:text-3xl">{promo.headline}</h2>
            {promo.subheadline ? (
              <p className="max-w-xl text-white/90">{promo.subheadline}</p>
            ) : null}
            {promo.promoCode ? (
              <p className="inline-flex rounded-full bg-white/15 px-3 py-1 font-mono text-sm">
                {promo.promoCode}
              </p>
            ) : null}
            {promo.countdown ? (
              <PromotionCountdown endsAt={promo.endsAt} className="pt-2" />
            ) : null}
            <Link
              href={promo.landingPagePath || "/book"}
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900"
              onClick={() => {
                void fetch("/api/promotions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ promotionId: promo.id, eventType: "click" }),
                });
              }}
            >
              {promo.cta}
            </Link>
          </div>
          {promo.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={promo.heroImageUrl}
              alt=""
              className="h-48 w-full rounded-2xl object-cover md:h-full"
            />
          ) : (
            <div className="flex min-h-[12rem] items-center justify-center rounded-2xl bg-white/10 text-sm text-white/80">
              Shalean Campaign
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
