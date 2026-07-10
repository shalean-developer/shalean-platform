"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
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
  colours?: { primary?: string; accent?: string };
};

const STORAGE_KEY = "shalean_promo_popup_dismissed";

/** Optional homepage / site-wide campaign popup. */
export function PromotionPopup() {
  const [promo, setPromo] = useState<DisplayPromo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const dismissed = sessionStorage.getItem(STORAGE_KEY);
        if (dismissed) return;
        const res = await fetch("/api/promotions?surface=popup");
        if (!res.ok) return;
        const j = (await res.json()) as { promotions?: DisplayPromo[] };
        const first = j.promotions?.[0];
        if (!first) return;
        setPromo(first);
        setOpen(true);
        void fetch("/api/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promotionId: first.id, eventType: "popup_view" }),
        });
      } catch {
        // ignore
      }
    })();
  }, []);

  if (!open || !promo) return null;

  const primary = promo.colours?.primary ?? "#0f172a";

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, promo!.id);
    setOpen(false);
    void fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotionId: promo!.id, eventType: "popup_dismiss" }),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={promo.headline}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="h-2 w-full" style={{ background: primary }} />
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-4 rounded-full p-1 text-slate-500 hover:bg-slate-100"
          onClick={dismiss}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="space-y-3 p-6 pt-5">
          {promo.offerLabel ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              {promo.offerLabel}
            </p>
          ) : null}
          <h2 className="pr-8 text-xl font-bold text-slate-900">{promo.headline}</h2>
          {promo.subheadline ? (
            <p className="text-sm text-slate-600">{promo.subheadline}</p>
          ) : null}
          {promo.promoCode ? (
            <p className="font-mono text-sm text-slate-800">
              Code: <span className="font-bold">{promo.promoCode}</span>
            </p>
          ) : null}
          {promo.countdown ? <PromotionCountdown endsAt={promo.endsAt} /> : null}
          <Link
            href={promo.landingPagePath || "/book"}
            className="inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold text-white"
            style={{ background: primary }}
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
      </div>
    </div>
  );
}
