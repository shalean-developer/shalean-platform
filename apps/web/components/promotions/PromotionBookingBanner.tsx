"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tag } from "lucide-react";
import { PromotionCountdown } from "./PromotionCountdown";
import { trackPromoEvent } from "./promoCta";

type DisplayPromo = {
  id: string;
  headline: string;
  cta: string;
  landingPagePath: string;
  offerLabel?: string;
  promoCode: string | null;
  endsAt: string | null;
  countdown?: boolean;
};

/** Compact banner for booking wizard. */
export function PromotionBookingBanner() {
  const [promo, setPromo] = useState<DisplayPromo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/promotions?surface=booking_banner");
        if (!res.ok) {
          const fallback = await fetch("/api/promotions?surface=booking");
          if (!fallback.ok) return;
          const j = (await fallback.json()) as { promotions?: DisplayPromo[] };
          setPromo(j.promotions?.[0] ?? null);
          return;
        }
        const j = (await res.json()) as { promotions?: DisplayPromo[] };
        setPromo(j.promotions?.[0] ?? null);
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!promo) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
      <div className="flex min-w-0 items-start gap-2">
        <Tag className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div>
          <p className="font-semibold">
            {promo.offerLabel ? `${promo.offerLabel} · ` : ""}
            {promo.headline}
          </p>
          {promo.promoCode ? (
            <p className="text-xs text-emerald-800">
              Use code <span className="font-mono font-bold">{promo.promoCode}</span> at checkout
            </p>
          ) : (
            <p className="text-xs text-emerald-800">Eligible savings apply automatically at checkout</p>
          )}
          {promo.countdown ? (
            <PromotionCountdown endsAt={promo.endsAt} className="mt-2" label="Ends in" />
          ) : null}
        </div>
      </div>
      <Link
        href={promo.landingPagePath}
        className="shrink-0 rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
        onClick={() => trackPromoEvent(promo.id, "landing_visit")}
      >
        Learn more
      </Link>
    </div>
  );
}
