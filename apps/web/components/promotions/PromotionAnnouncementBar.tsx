"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

type DisplayPromo = {
  id: string;
  headline: string;
  cta: string;
  landingPagePath: string;
  colours?: { primary?: string; accent?: string };
  countdown?: boolean;
  endsAt: string | null;
  promoCode: string | null;
};

function countdownLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ending soon";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m left`;
}

/** Sticky announcement bar for active seasonal / homepage promotions. */
export function PromotionAnnouncementBar() {
  const [promo, setPromo] = useState<DisplayPromo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/promotions?surface=announcement");
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

  if (!promo || dismissed) return null;

  const bg = promo.colours?.primary ?? "#0f172a";
  const accent = promo.colours?.accent ?? "#34d399";
  const cd = promo.countdown ? countdownLabel(promo.endsAt) : null;

  return (
    <div
      className="relative z-40 flex items-center justify-center gap-3 px-4 py-2.5 text-center text-sm text-white"
      style={{ background: `linear-gradient(90deg, ${bg}, ${accent}55)` }}
    >
      <p className="font-medium">
        {promo.headline}
        {promo.promoCode ? (
          <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 font-mono text-xs">
            {promo.promoCode}
          </span>
        ) : null}
        {cd ? <span className="ml-2 opacity-90">· {cd}</span> : null}
      </p>
      <Link
        href={promo.landingPagePath || "/book"}
        className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-900"
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
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-white/10"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
