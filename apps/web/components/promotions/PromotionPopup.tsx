"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
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
const LANDING_DELAY_MS = 450;

async function fetchLandingPromo(): Promise<DisplayPromo | null> {
  const popupRes = await fetch("/api/promotions?surface=popup");
  if (popupRes.ok) {
    const j = (await popupRes.json()) as { promotions?: DisplayPromo[] };
    if (j.promotions?.[0]) return j.promotions[0];
  }
  // Fall back so announcement-bar campaigns also greet visitors on land.
  const barRes = await fetch("/api/promotions?surface=announcement");
  if (!barRes.ok) return null;
  const j = (await barRes.json()) as { promotions?: DisplayPromo[] };
  return j.promotions?.[0] ?? null;
}

/** Site-wide campaign popup shown shortly after landing. */
export function PromotionPopup() {
  const titleId = useId();
  const [promo, setPromo] = useState<DisplayPromo | null>(null);
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    let enterTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const dismissed = sessionStorage.getItem(STORAGE_KEY);
        if (dismissed) return;
        const first = await fetchLandingPromo();
        if (!first || cancelled) return;
        setPromo(first);
        openTimer = setTimeout(() => {
          if (cancelled) return;
          setOpen(true);
          enterTimer = setTimeout(() => {
            if (!cancelled) setEntered(true);
          }, 20);
          void fetch("/api/promotions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promotionId: first.id, eventType: "popup_view" }),
          });
        }, LANDING_DELAY_MS);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      if (openTimer) clearTimeout(openTimer);
      if (enterTimer) clearTimeout(enterTimer);
    };
  }, []);

  useEffect(() => {
    if (!open || !promo) return;

    const dismissNow = () => {
      sessionStorage.setItem(STORAGE_KEY, promo.id);
      setEntered(false);
      setOpen(false);
      void fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId: promo.id, eventType: "popup_dismiss" }),
      });
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissNow();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, promo]);

  if (!open || !promo) return null;

  const primary = promo.colours?.primary ?? "#0d1b69";
  const accent = promo.colours?.accent ?? "#34d399";

  function dismiss() {
    sessionStorage.setItem(STORAGE_KEY, promo.id);
    setEntered(false);
    setOpen(false);
    void fetch("/api/promotions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotionId: promo.id, eventType: "popup_dismiss" }),
    });
  }

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center sm:p-6 ${
        entered ? "bg-slate-950/50 backdrop-blur-[2px]" : "bg-slate-950/0"
      } transition-colors duration-300`}
      onClick={dismiss}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full max-w-[26rem] overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(13,27,105,0.28)] transition-all duration-300 ease-out ${
          entered
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-6 scale-[0.97] opacity-0 sm:translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative overflow-hidden px-6 pb-5 pt-6 text-white"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${primary}ee 48%, ${accent}99 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-30"
            style={{ background: accent }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 left-8 h-28 w-28 rounded-full bg-white/10"
            aria-hidden
          />
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full bg-white/15 p-1.5 text-white transition hover:bg-white/25"
            onClick={dismiss}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative flex items-start gap-3 pr-8">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1.5">
              {promo.offerLabel ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                  {promo.offerLabel}
                </p>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                  Limited offer
                </p>
              )}
              <h2 id={titleId} className="text-balance text-2xl font-bold leading-tight tracking-tight">
                {promo.headline}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {promo.subheadline ? (
            <p className="text-sm leading-relaxed text-slate-600">{promo.subheadline}</p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-600">
              Book your first clean with Shalean and save. Trusted cleaners, flexible scheduling,
              and a spotless home — guaranteed.
            </p>
          )}

          {promo.promoCode ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Promo code
                </p>
                <p className="font-mono text-base font-bold tracking-wide text-slate-900">
                  {promo.promoCode}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                style={{ background: primary }}
              >
                Save
              </span>
            </div>
          ) : null}

          {promo.countdown ? <PromotionCountdown endsAt={promo.endsAt} /> : null}

          <Link
            href={promo.landingPagePath || "/book"}
            className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${accent})`,
              boxShadow: `0 12px 28px ${primary}33`,
            }}
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
            className="w-full py-1 text-center text-sm font-medium text-slate-500 transition hover:text-slate-800"
            onClick={dismiss}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
