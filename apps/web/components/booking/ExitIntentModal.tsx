"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { getBookingSummaryServiceLabel } from "@/components/booking/serviceCategories";
import {
  formatLockedAppointmentLabel,
  getLockedBookingDisplayPrice,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { buildBookingQueryString } from "@/lib/booking/bookingUrl";
import {
  ANALYTICS_EVENTS,
  getOrCreateBookingFunnelSessionId,
  trackBookingAnalyticsEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";
import { cn } from "@/lib/utils";

type ExitIntentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Primary action — navigate to checkout, scroll to pay, or focus schedule. */
  onCompleteBooking: () => void;
};

function serviceLine(locked: LockedBooking | null, step1: BookingStep1State | null): string | null {
  if (locked?.service) {
    return getBookingSummaryServiceLabel(locked.service, locked.service_type);
  }
  if (step1?.service) {
    return getBookingSummaryServiceLabel(step1.service, step1.service_type);
  }
  return null;
}

function buildQuoteQuery(step1: BookingStep1State | null, locked: LockedBooking | null): string {
  const service = locked?.service ?? step1?.service ?? null;
  const location = step1?.serviceAreaName || step1?.location || locked?.location || "";
  return buildBookingQueryString({
    service: service ?? undefined,
    location: location || undefined,
    bedrooms: step1?.rooms ?? locked?.rooms ?? undefined,
    bathrooms: step1?.bathrooms ?? locked?.bathrooms ?? undefined,
    extraRooms: step1?.extraRooms ?? undefined,
    extras: (step1?.extras?.length ? step1.extras : locked?.extras ?? []).join(","),
    source: "booking_recovery",
  });
}

function appendQuery(path: string, query: string): string {
  if (!query) return path;
  return path.includes("?") ? `${path}&${query}` : `${path}?${query}`;
}

function buildWhatsappRecoveryUrl(continueUrl: string, summary: string): string {
  try {
    const url = new URL(CUSTOMER_SUPPORT_WHATSAPP_URL);
    url.searchParams.set(
      "text",
      `Hi Shalean, I want to continue my booking. ${summary ? `Quote: ${summary}. ` : ""}${continueUrl}`,
    );
    return url.toString();
  } catch {
    return CUSTOMER_SUPPORT_WHATSAPP_URL;
  }
}

export function ExitIntentModal({ open, onOpenChange, onCompleteBooking }: ExitIntentModalProps) {
  const { step, lockedBooking, bookingHref } = useBookingFlow();
  const step1 = usePersistedBookingSummaryState();
  const { canonicalTotalZar } = useBookingPrice();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const estimateZar = canonicalTotalZar;
  const svcLabel = useMemo(() => serviceLine(lockedBooking, step1), [lockedBooking, step1]);
  const lockedWhenLabel = useMemo(
    () => (lockedBooking ? formatLockedAppointmentLabel(lockedBooking) : null),
    [lockedBooking],
  );
  const lockedPriceZar = useMemo(
    () => (lockedBooking ? getLockedBookingDisplayPrice(lockedBooking) : null),
    [lockedBooking],
  );

  const lockedSummaryOneLine = useMemo(() => {
    if (!lockedBooking || !svcLabel || !lockedWhenLabel) return null;
    return `${svcLabel} · ${lockedWhenLabel}`;
  }, [lockedBooking, svcLabel, lockedWhenLabel]);

  const showUrgencyBadge = step === "when" || step === "checkout";
  const quoteLabel = useMemo(() => {
    const price = lockedPriceZar ?? estimateZar;
    return [svcLabel, price != null ? `R ${Math.round(price).toLocaleString("en-ZA")}` : null]
      .filter(Boolean)
      .join(" · ");
  }, [estimateZar, lockedPriceZar, svcLabel]);
  const recoveryHref = useMemo(() => {
    const query = buildQuoteQuery(step1, lockedBooking);
    return appendQuery(bookingHref(lockedBooking ? "checkout" : step), query);
  }, [bookingHref, lockedBooking, step, step1]);
  const recoveryAbsoluteUrl = useMemo(() => {
    if (typeof window === "undefined") return recoveryHref;
    return new URL(recoveryHref, window.location.origin).toString();
  }, [recoveryHref]);
  const whatsappUrl = useMemo(
    () => buildWhatsappRecoveryUrl(recoveryAbsoluteUrl, quoteLabel),
    [quoteLabel, recoveryAbsoluteUrl],
  );

  const dismiss = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => primaryRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setSaveMessage(null));
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_RECOVERY_PROMPT_SHOWN, lockedBooking ?? step1, {
      step,
      recovery_surface: "exit_intent",
      selected_extras: step1?.extras ?? lockedBooking?.extras ?? [],
      estimated_price: lockedPriceZar ?? estimateZar ?? null,
      suburb: step1?.serviceAreaName || step1?.location || lockedBooking?.location || null,
    });
  }, [estimateZar, lockedBooking, lockedPriceZar, open, step, step1]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  async function saveQuote() {
    if (saving) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/booking/recovery-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          continueUrl: recoveryHref,
          whatsappUrl,
          serviceLabel: svcLabel ?? "Cleaning",
          quoteLabel,
          step,
          bookingSessionId: getOrCreateBookingFunnelSessionId(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveMessage(data.error ?? "Could not save your quote. Please try again.");
        return;
      }
      try {
        localStorage.setItem("booking_recovery_saved_at", new Date().toISOString());
      } catch {
        /* ignore */
      }
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_RECOVERY_SAVED, lockedBooking ?? step1, {
        step,
        recovery_surface: "exit_intent",
        recovery_channel: "email",
        selected_extras: step1?.extras ?? lockedBooking?.extras ?? [],
        estimated_price: lockedPriceZar ?? estimateZar ?? null,
        suburb: step1?.serviceAreaName || step1?.location || lockedBooking?.location || null,
      });
      setSaveMessage("Saved. Check your email for the link.");
    } catch {
      setSaveMessage("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={dismiss}
      />
      <div
        className={cn(
          "relative z-[101] w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-xl shadow-zinc-900/10",
          "dark:border dark:border-zinc-700/80 dark:bg-zinc-900",
        )}
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">
          {showUrgencyBadge ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
              <span aria-hidden>✨</span>
              Slots filling fast
            </span>
          ) : null}
        </div>

        <h2
          id="exit-intent-title"
          className="text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          Need more time?
        </h2>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {lockedBooking
            ? "Save your quote or continue now before the slot is taken."
            : "Save your quote and continue your booking when you’re ready."}
        </p>

        {lockedBooking && lockedSummaryOneLine && lockedPriceZar != null ? (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            <p className="leading-snug">{lockedSummaryOneLine}</p>
            <p className="mt-1.5 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
              R {lockedPriceZar.toLocaleString("en-ZA")}
            </p>
          </div>
        ) : !lockedBooking && (svcLabel != null || estimateZar != null) ? (
          <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            {svcLabel ? <p className="leading-snug">{svcLabel}</p> : null}
            {estimateZar != null ? (
              <p className="mt-1.5 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                From R {Math.round(estimateZar).toLocaleString("en-ZA")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Pick a time on the next step to lock this in.</p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>✔ No payment yet</span>
          <span>✔ Free reschedule</span>
        </div>

        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
          <label className="block text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-100">
            Save your quote
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-blue-900/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void saveQuote()}
            disabled={saving || !email.trim()}
            className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            {saving ? "Saving..." : "Email me my quote"}
          </button>
          {saveMessage ? <p className="mt-2 text-xs text-blue-900 dark:text-blue-100">{saveMessage}</p> : null}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_RECOVERY_WHATSAPP_CLICKED, lockedBooking ?? step1, {
                step,
                recovery_surface: "exit_intent",
                recovery_channel: "whatsapp",
                selected_extras: step1?.extras ?? lockedBooking?.extras ?? [],
                estimated_price: lockedPriceZar ?? estimateZar ?? null,
                suburb: step1?.serviceAreaName || step1?.location || lockedBooking?.location || null,
              });
            }}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-emerald-200 bg-white py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-950/30"
          >
            WhatsApp: Continue your booking
          </a>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
          >
            Continue later
          </button>
          <button
            type="button"
            ref={primaryRef}
            onClick={() => {
              onCompleteBooking();
              onOpenChange(false);
            }}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.99]"
          >
            Complete booking →
          </button>
        </div>
      </div>
    </div>
  );
}
