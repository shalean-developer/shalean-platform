"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const HELD_WINDOW_MS = 5 * 60 * 1000;

function SlotHoldCountdown({ lockedAt, align }: { lockedAt: string; align: "center" | "start" }) {
  const endMs = useMemo(() => {
    const t = Date.parse(lockedAt);
    if (!Number.isFinite(t)) return null;
    return t + HELD_WINDOW_MS;
  }, [lockedAt]);

  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    if (endMs == null) return;
    const tick = () => setRemainingSec(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endMs]);

  const alignClass = align === "center" ? "text-center" : "text-left";

  if (endMs == null) {
    return (
      <p className={cn("text-[11px] leading-snug text-zinc-600 dark:text-zinc-400", alignClass)}>
        {bookingCopy.checkout.slotHeldFallback}
      </p>
    );
  }

  if (remainingSec <= 0) {
    return (
      <p className={cn("text-[11px] leading-snug text-amber-800 dark:text-amber-200", alignClass)}>
        If payment does not go through, choose your time again to refresh your quote.
      </p>
    );
  }

  const minutes = Math.max(1, Math.ceil(remainingSec / 60));
  return (
    <p className={cn("text-[11px] leading-snug text-zinc-600 dark:text-zinc-400", alignClass)}>
      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
        ~{minutes} min left at this price
      </span>
      <span className="text-zinc-500 dark:text-zinc-500"> · </span>
      <span>Checkout usually under 1 minute</span>
    </p>
  );
}

export type CheckoutSideBadgeMode = "mobile" | "desktop";

export type CheckoutSideBadgeProps = {
  mode: CheckoutSideBadgeMode;
  lockedAt: string;
  showCountdown: boolean;
  totalZar: number | null;
  amountDisplayOverride?: string | null;
  canPay: boolean;
  paying: boolean;
  onPay: () => void;
  onBack: () => void;
  continueLabel: string;
  className?: string;
  /** Desktop: mount node for promo/tip UI (filled via portal from the payment form). */
  promoTipHostRef?: React.RefCallback<HTMLDivElement | null>;
};

export function CheckoutSideBadge({
  mode,
  lockedAt,
  showCountdown,
  totalZar,
  amountDisplayOverride = null,
  canPay,
  paying,
  onPay,
  onBack,
  continueLabel,
  className,
  promoTipHostRef,
}: CheckoutSideBadgeProps) {
  const copy = bookingCopy.checkout;
  const amountLine =
    amountDisplayOverride ??
    (totalZar != null && Number.isFinite(totalZar) && totalZar >= 1
      ? `R ${totalZar.toLocaleString("en-ZA")}`
      : "—");

  return (
    <aside
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/20",
        mode === "desktop" ? "space-y-4" : "space-y-3",
        className,
      )}
      aria-label="Checkout summary"
    >
      {mode === "desktop" && promoTipHostRef ? (
        <div ref={promoTipHostRef} className="min-h-0 border-b border-zinc-100 pb-4 dark:border-zinc-800" />
      ) : null}

      <p
        className="rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
        role="status"
      >
        {copy.lockedCheckoutNotice}
      </p>

      {showCountdown ? <SlotHoldCountdown lockedAt={lockedAt} align={mode === "desktop" ? "start" : "center"} /> : null}

      {mode === "desktop" ? (
        <>
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{bookingCopy.stickyBar.total}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{amountLine}</p>
          </div>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-14 min-w-14 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onPay}
              disabled={!canPay || paying}
              className={cn(
                "min-h-14 min-w-0 flex-1 rounded-xl px-4 text-sm font-semibold tracking-tight transition-all",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                canPay
                  ? paying
                    ? "cursor-wait bg-primary text-primary-foreground opacity-95"
                    : "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 active:scale-[0.99]"
                  : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
              )}
            >
              {paying ? "Redirecting…" : continueLabel}
            </button>
          </div>
        </>
      ) : null}

      <div className="space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <p className="text-left text-xs font-medium text-zinc-700 dark:text-zinc-300">{copy.subtext}</p>
        <p className="text-left text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{copy.payFooterTrustLine}</p>
      </div>
    </aside>
  );
}
