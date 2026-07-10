"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
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
};

/** Customer account dashboard card for active campaigns. */
export function PromotionDashboardCard() {
  const [promo, setPromo] = useState<DisplayPromo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/promotions?surface=dashboard");
        if (!res.ok) return;
        const j = (await res.json()) as { promotions?: DisplayPromo[] };
        setPromo(j.promotions?.[0] ?? null);
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!promo) return null;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Active offer
          </p>
          {promo.offerLabel ? (
            <p className="mt-1 text-lg font-bold text-slate-900">{promo.offerLabel}</p>
          ) : null}
          <p className="font-medium text-slate-800">{promo.headline}</p>
          {promo.promoCode ? (
            <p className="mt-1 font-mono text-sm text-slate-600">{promo.promoCode}</p>
          ) : null}
          {promo.countdown ? (
            <PromotionCountdown endsAt={promo.endsAt} className="mt-3" />
          ) : null}
          <Link
            href={promo.landingPagePath || "/book"}
            className="mt-4 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {promo.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
