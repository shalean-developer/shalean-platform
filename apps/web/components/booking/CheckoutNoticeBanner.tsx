"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

export type CheckoutNoticeTone = "danger" | "success";

type CheckoutNoticeBannerProps = {
  open: boolean;
  tone?: CheckoutNoticeTone;
  title: string;
  description: string;
  onDismiss: () => void;
  /** Default 4000 for danger, 6000 for success; set 0 to disable auto-dismiss */
  autoDismissMs?: number;
  cta?: { label: string; onClick: () => void };
};

export function CheckoutNoticeBanner({
  open,
  tone = "danger",
  title,
  description,
  onDismiss,
  autoDismissMs,
  cta,
}: CheckoutNoticeBannerProps) {
  const resolvedAuto =
    autoDismissMs !== undefined
      ? autoDismissMs
      : tone === "success"
        ? 6000
        : 4000;

  useEffect(() => {
    if (!open || resolvedAuto <= 0) return;
    const t = window.setTimeout(onDismiss, resolvedAuto);
    return () => window.clearTimeout(t);
  }, [open, resolvedAuto, onDismiss, title, description]);

  const shell =
    tone === "success"
      ? "border-emerald-200/90 bg-emerald-50/95 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-50"
      : "border-rose-200/90 bg-rose-50/95 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-50";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="checkout-notice"
          role="alert"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mb-6"
        >
          <div
            className={[
              "relative rounded-2xl border px-4 py-4 shadow-sm sm:px-5 sm:py-4",
              shell,
            ].join(" ")}
          >
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-current opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="flex gap-3 pr-10">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  {tone === "danger" ? (
                    <span className="mt-0.5 text-xl leading-none" aria-hidden>
                      ⚠️
                    </span>
                  ) : (
                    <span className="mt-0.5 text-xl leading-none text-emerald-600 dark:text-emerald-400" aria-hidden>
                      ✓
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed opacity-90">{description}</p>
                  </div>
                </div>
                {cta ? (
                  <button
                    type="button"
                    onClick={() => {
                      cta.onClick();
                      onDismiss();
                    }}
                    className={[
                      "mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                      tone === "success"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                        : "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400",
                    ].join(" ")}
                  >
                    {cta.label}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
