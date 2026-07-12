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

/** CSS offset for fixed bottom promo bar (includes safe-area). */
export const PROMO_ANNOUNCEMENT_OFFSET_VAR = "--promo-announcement-offset";

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

function clearPromoBarChrome() {
  document.documentElement.style.removeProperty(PROMO_ANNOUNCEMENT_OFFSET_VAR);
  document.documentElement.removeAttribute("data-promo-announcement");
}

/** Fixed bottom announcement bar for active seasonal / homepage promotions. */
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

  useEffect(() => {
    if (!promo || dismissed) {
      clearPromoBarChrome();
      return;
    }
    document.documentElement.style.setProperty(
      PROMO_ANNOUNCEMENT_OFFSET_VAR,
      "calc(2.75rem + env(safe-area-inset-bottom, 0px))",
    );
    document.documentElement.setAttribute("data-promo-announcement", "");
    return () => clearPromoBarChrome();
  }, [promo, dismissed]);

  if (!promo || dismissed) return null;

  const bg = promo.colours?.primary ?? "#0d1b69";
  const accent = promo.colours?.accent ?? "#34d399";
  const cd = promo.countdown ? countdownLabel(promo.endsAt) : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[45] flex items-center justify-center gap-3 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-center text-sm text-white shadow-[0_-4px_24px_rgba(13,27,105,0.18)]"
      style={{ background: `linear-gradient(90deg, ${bg}, ${accent}55)` }}
      role="region"
      aria-label="Promotion"
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
