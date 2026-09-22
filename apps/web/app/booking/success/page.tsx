"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, CreditCard, MessageCircle } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type {
  PaystackVerifyPostFailure,
  PaystackVerifyPostResponse,
  PaystackVerifyPostSuccess,
} from "@/lib/booking/paystackVerifyResponse";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { ANALYTICS_EVENTS, trackBookingAnalyticsEvent } from "@/lib/booking/bookingFlowAnalytics";
import { markRetargetingCandidate, trackGrowthEvent } from "@/lib/growth/trackEvent";
import { trackClientPurchase } from "@/lib/ads/trackClientPurchase";
import {
  emitBookingSubmittedAfterPaystackVerify,
  finalizeCoveredBookingSubmitted,
  resolveBookingSuccessPath,
} from "@/lib/analytics/bookingSuccessSubmitted";
import { clearStoredReferral } from "@/lib/referrals/client";
import {
  clearBookingV2DraftStorage,
  consumeBookingV2SuccessRedirect,
} from "@/lib/booking-v2/bookingV2PaymentRedirect";
import { BookingConfirmationHero } from "@/components/booking/BookingConfirmationHero";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { CUSTOMER_SUPPORT_WHATSAPP_E164 } from "@/lib/site/customerSupport";
import { resolveCustomerTotalPaidZar } from "@/lib/booking/customerBookingReference";
const VERIFY_MAX_ATTEMPTS = 2;
const VERIFY_RETRY_DELAY_MS = 500;
const PERSISTENCE_POLL_ATTEMPTS = 3;
const PERSISTENCE_POLL_DELAY_MS = 250;
/** Per-attempt fetch timeout — prevents "Confirming…" from hanging forever on a stuck verify. */
// Must exceed the server's 12s Paystack timeout plus local/dev route compilation overhead.
const VERIFY_FETCH_TIMEOUT_MS = 18_000;
const OWNED_BOOKING_FETCH_TIMEOUT_MS = 4_000;

function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-md px-4 py-10 sm:py-14 ${className ?? ""}`}>{children}</div>
  );
}
type StatusPayload = {
  verified?: boolean;
  paymentStatus?: "success" | "failed" | "pending" | "unknown";
  reference?: string;
  amountCents?: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string | null;
  userId?: string | null;
  bookingSnapshot?: unknown;
  bookingInDatabase?: boolean;
  bookingId?: string | null;
  bookingReference?: string | null;
  error?: string;
  upsertError?: string | null;
  assignmentType?: string | null;
  fallbackReason?: string | null;
  showCleanerSubstitutionNotice?: boolean;
  attemptedCleanerId?: string | null;
  assignedCleanerId?: string | null;
  selectedCleanerId?: string | null;
  /** Credit-covered / zero-balance success — no Paystack charge. */
  coveredSettlement?: boolean;
};

type OwnedPaymentSummary = {
  bookingId?: string;
  paid?: boolean;
  amountZar?: number;
  amountPaidCents?: number | null;
  totalPaidZar?: number | null;
  bookingReference?: string | null;
  paystackReference?: string | null;
  bookingSnapshot?: unknown;
  serviceLabel?: string;
  grossAmountZar?: number;
  cleaningCreditZar?: number;
};

function isSnapshot(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Paystack paid and a `bookings` row exists — safe to show “booking confirmed” funnel and copy. */
function isBookingPersisted(data: PaystackVerifyPostSuccess): boolean {
  return Boolean(data.bookingId?.trim()) && data.bookingInDatabase === true;
}

function mapVerifySuccessToStatus(data: PaystackVerifyPostSuccess): StatusPayload {
  return {
    verified: true,
    paymentStatus: "success",
    reference: data.reference,
    amountCents: data.amountCents,
    currency: data.currency,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    userId: data.userId,
    bookingSnapshot: data.bookingSnapshot,
    bookingInDatabase: data.bookingInDatabase,
    bookingId: data.bookingId,
    bookingReference: data.bookingReference ?? null,
    upsertError: data.upsertError,
    assignmentType: data.assignmentType ?? null,
    fallbackReason: data.fallbackReason ?? null,
    showCleanerSubstitutionNotice: Boolean(data.showCleanerSubstitutionNotice),
    attemptedCleanerId: data.attemptedCleanerId ?? null,
    assignedCleanerId: data.assignedCleanerId ?? null,
    selectedCleanerId: data.selectedCleanerId ?? null,
  };
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  const bookingIdParam = searchParams.get("bookingId");
  const successPath = resolveBookingSuccessPath({
    areaReview: searchParams.get("areaReview"),
    bookingId: bookingIdParam,
    reference,
    covered: searchParams.get("covered"),
  });

  const [phase, setPhase] = useState<
    | "missing"
    | "area_review"
    | "finalizing"
    | "success"
    | "persist_pending"
    | "needs_retry"
    | "failed"
  >(() => {
    if (successPath === "area_review") return "area_review";
    if (successPath === "missing") return "missing";
    return "finalizing";
  });

  const [statusData, setStatusData] = useState<StatusPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const runIdRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const finalizeCoveredBooking = useCallback(async (): Promise<boolean> => {
    const bookingId = bookingIdParam?.trim() ?? "";
    if (!bookingId) return false;
    if (completedRef.current) return true;

    const runId = ++runIdRef.current;
    setPhase("finalizing");

    const sb = getSupabaseBrowser();
    if (!sb) {
      setErrorMessage("Could not load your session.");
      setPhase("needs_retry");
      return false;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token?.trim() ?? "";
    if (!token) {
      setErrorMessage("Please sign in to view your booking confirmation.");
      setPhase("needs_retry");
      return false;
    }
    if (runId !== runIdRef.current) return false;

    const { emitted, result } = await finalizeCoveredBookingSubmitted({
      bookingId,
      accessToken: token,
    });
    if (runId !== runIdRef.current) return false;

    if (!result.ok) {
      if (result.reason === "unsettled") {
        setErrorMessage("Your booking is not fully confirmed yet.");
        setPhase("needs_retry");
        return false;
      }
      if (result.reason === "unauthorized") {
        setErrorMessage("Please sign in to view your booking confirmation.");
        setPhase("needs_retry");
        return false;
      }
      setErrorMessage("Could not confirm your booking yet. You can try again.");
      setPhase("needs_retry");
      return false;
    }

    const booking = result.booking;
    setStatusData({
      verified: true,
      paymentStatus: "success",
      reference: booking.paystack_reference ?? booking.id,
      amountCents: 0,
      currency: "ZAR",
      bookingInDatabase: true,
      bookingId: booking.id,
      bookingReference: booking.booking_reference ?? null,
      bookingSnapshot: {
        total_zar: booking.total_paid_zar ?? 0,
        flat: { service: booking.service_slug ?? booking.service ?? null },
      },
      coveredSettlement: true,
    });
    setErrorMessage(null);
    // emitted already handled inside finalizeCoveredBookingSubmitted (once-per-id)
    void emitted;

    completedRef.current = true;
    setPhase("success");

    try {
      markRetargetingCandidate(false);
      clearStoredReferral("customer");
      clearBookingV2DraftStorage();
      consumeBookingV2SuccessRedirect();
      trackGrowthEvent(ANALYTICS_EVENTS.COMPLETE_BOOKING, {
        reference: booking.paystack_reference ?? null,
        booking_id: booking.id,
        covered_settlement: true,
      });
      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_COMPLETED, null, {
        reference: booking.paystack_reference ?? null,
        booking_id: booking.id,
        service_type: booking.service_slug ?? booking.service ?? null,
        estimated_price: booking.total_paid_zar ?? 0,
      });
    } catch {
      // non-fatal — confirmation already shown
    }
    return true;
  }, [bookingIdParam]);

  const recoverPersistedPaidBooking = useCallback(
    async (runId: number): Promise<boolean> => {
      const bookingId = bookingIdParam?.trim() ?? "";
      if (!bookingId || completedRef.current) return completedRef.current;

      let summary: OwnedPaymentSummary | null = null;
      const sb = getSupabaseBrowser();

      if (sb) {
        try {
          const { data: sessionData } = await sb.auth.getSession();
          const token = sessionData.session?.access_token?.trim() ?? "";
          if (token && runId === runIdRef.current) {
            const response = await fetch(
              `/api/bookings/${encodeURIComponent(bookingId)}/payment-summary`,
              {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
                signal: AbortSignal.timeout(OWNED_BOOKING_FETCH_TIMEOUT_MS),
              },
            );
            if (response.ok && runId === runIdRef.current) {
              summary = (await response.json()) as OwnedPaymentSummary;
            }
          }
        } catch {
          // Fall through to reference-bound database recovery.
        }
      }

      if (!summary && reference && runId === runIdRef.current) {
        try {
          const query = new URLSearchParams({ reference, bookingId });
          const response = await fetch(`/api/paystack/status?${query.toString()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(OWNED_BOOKING_FETCH_TIMEOUT_MS),
          });
          if (response.ok && runId === runIdRef.current) {
            const payload = (await response.json()) as {
              confirmation?: OwnedPaymentSummary | null;
            };
            summary = payload.confirmation ?? null;
          }
        } catch {
          return false;
        }
      }

      if (!summary?.paid || summary.bookingId !== bookingId || runId !== runIdRef.current) {
        return false;
      }

      const amountCents =
        typeof summary.amountPaidCents === "number" && Number.isFinite(summary.amountPaidCents)
          ? Math.max(0, Math.round(summary.amountPaidCents))
          : Math.max(
              0,
              Math.round(Number(summary.totalPaidZar ?? summary.amountZar ?? 0) * 100),
            );
      const persistedReference = summary.paystackReference?.trim() || reference || bookingId;
      const snapshot = isSnapshot(summary.bookingSnapshot)
        ? summary.bookingSnapshot
        : {
            total_zar: Number(summary.totalPaidZar ?? summary.amountZar ?? 0),
            flat: { service: summary.serviceLabel ?? null },
          };

      setStatusData({
        verified: true,
        paymentStatus: "success",
        reference: persistedReference,
        amountCents,
        currency: "ZAR",
        bookingSnapshot: snapshot,
        bookingInDatabase: true,
        bookingId,
        bookingReference: summary.bookingReference ?? null,
      });
      setErrorMessage(null);
      completedRef.current = true;
      setPhase("success");

      emitBookingSubmittedAfterPaystackVerify({
        bookingPersisted: true,
        bookingId,
        reference: summary.bookingReference ?? persistedReference,
        service: summary.serviceLabel ?? null,
        value: amountCents / 100,
      });
      try {
        markRetargetingCandidate(false);
        clearStoredReferral("customer");
        clearBookingV2DraftStorage();
        consumeBookingV2SuccessRedirect();
        trackGrowthEvent(ANALYTICS_EVENTS.COMPLETE_BOOKING, {
          reference: persistedReference,
          booking_id: bookingId,
          recovered_from_persisted_payment: true,
        });
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_COMPLETED, null, {
          reference: persistedReference,
          booking_id: bookingId,
          service_type: summary.serviceLabel ?? null,
          estimated_price: amountCents / 100,
        });
      } catch {
        // Non-fatal: the authoritative paid booking is already displayed.
      }
      return true;
    },
    [bookingIdParam, reference],
  );

  const finalizeBooking = useCallback(async (): Promise<boolean> => {
    if (!reference) return false;
    if (completedRef.current) return true;

    const runId = ++runIdRef.current;
    setPhase("finalizing");

    // The Paystack callback carries the already-persisted booking id. On reloads,
    // webhook wins, or a previous verify that completed after a browser timeout,
    // recover from the customer-owned row without another remote Paystack call.
    if (await recoverPersistedPaidBooking(runId)) return true;

    // Give the signed Paystack webhook a brief opportunity to persist the paid
    // booking. When it wins the race, `/api/paystack/verify` uses its trusted DB
    // fast path and avoids another remote Paystack verification request.
    for (let poll = 0; poll < PERSISTENCE_POLL_ATTEMPTS; poll++) {
      if (runId !== runIdRef.current) return false;
      try {
        const statusRes = await fetch(
          `/api/paystack/status?${new URLSearchParams({ reference }).toString()}`,
          { cache: "no-store", signal: AbortSignal.timeout(1_500) },
        );
        const statusJson = (await statusRes.json()) as { status?: string };
        const status = statusJson.status?.trim().toLowerCase() ?? "unknown";
        if (statusRes.ok && !["unknown", "pending_payment", "payment_expired"].includes(status)) {
          if (await recoverPersistedPaidBooking(runId)) return true;
          break;
        }
      } catch {
        // Status polling is only an optimization; canonical verification follows.
      }
      if (poll < PERSISTENCE_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, PERSISTENCE_POLL_DELAY_MS));
      }
    }

    for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
      if (runId !== runIdRef.current) return false;
      if (attempt > 1 && (await recoverPersistedPaidBooking(runId))) return true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), VERIFY_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
          signal: controller.signal,
        });

        const data = (await res.json()) as PaystackVerifyPostResponse;
        if (runId !== runIdRef.current) return false;

        if (res.ok && data.success && data.paymentStatus === "success") {
          const okData = data as PaystackVerifyPostSuccess;
          setStatusData(mapVerifySuccessToStatus(okData));
          setErrorMessage(null);

          if (isBookingPersisted(okData)) {
            const completedSnap = isSnapshot(okData.bookingSnapshot)
              ? (okData.bookingSnapshot as BookingSnapshotV1)
              : null;
            const completedLocked = completedSnap?.locked;
            const completedService =
              completedLocked?.service_type ??
              completedLocked?.service ??
              completedSnap?.flat?.service ??
              null;

            emitBookingSubmittedAfterPaystackVerify({
              bookingPersisted: true,
              bookingId: okData.bookingId,
              reference: okData.bookingReference ?? okData.reference ?? reference,
              service: typeof completedService === "string" ? completedService : null,
              value:
                typeof okData.amountCents === "number" && okData.amountCents > 0
                  ? Math.round(okData.amountCents / 100)
                  : (completedSnap?.total_zar ?? null),
            });

            completedRef.current = true;
            setPhase("success");

            try {
              markRetargetingCandidate(false);
              clearStoredReferral("customer");
              clearBookingV2DraftStorage();
              consumeBookingV2SuccessRedirect();
              trackGrowthEvent(ANALYTICS_EVENTS.COMPLETE_BOOKING, {
                reference: okData.reference ?? null,
                booking_id: okData.bookingId ?? null,
                assignment_type: okData.assignmentType ?? null,
                fallback_reason: okData.fallbackReason ?? null,
                attempted_cleaner_id: okData.attemptedCleanerId ?? null,
                assigned_cleaner_id: okData.assignedCleanerId ?? null,
                selected_cleaner_id: okData.selectedCleanerId ?? null,
              });
              trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_COMPLETED, completedLocked, {
                reference: okData.reference ?? null,
                booking_id: okData.bookingId ?? null,
                service_type:
                  completedLocked?.service_type ??
                  completedLocked?.service ??
                  completedSnap?.flat?.service ??
                  null,
                selected_extras: completedLocked?.extras ?? completedSnap?.flat?.extras ?? [],
                estimated_price: completedSnap?.total_zar ?? completedLocked?.finalPrice ?? null,
                estimated_hours: completedLocked?.finalHours ?? null,
                cleaner_mode: okData.selectedCleanerId || completedSnap?.cleaner_id ? "manual" : "auto",
                cleaner_id: okData.selectedCleanerId ?? completedSnap?.cleaner_id ?? null,
                assignment_type: okData.assignmentType ?? null,
                fallback_reason: okData.fallbackReason ?? null,
                attempted_cleaner_id: okData.attemptedCleanerId ?? null,
                assigned_cleaner_id: okData.assignedCleanerId ?? null,
                selected_cleaner_id: okData.selectedCleanerId ?? null,
              });
              const refKey = String(okData.reference ?? reference ?? "").trim();
              const k = refKey ? `shalean_payment_completed_${refKey}` : "";
              if (typeof sessionStorage !== "undefined" && k) {
                if (!sessionStorage.getItem(k)) {
                  sessionStorage.setItem(k, "1");
                  trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
                    reference: okData.reference ?? null,
                    booking_id: okData.bookingId ?? null,
                    booking_saved: true,
                  });
                }
              } else {
                trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
                  reference: okData.reference ?? null,
                  booking_id: okData.bookingId ?? null,
                  booking_saved: true,
                });
              }
              const completedSnapForAds = completedSnap;
              trackClientPurchase({
                reference: String(okData.reference ?? reference ?? "").trim(),
                bookingId: okData.bookingId ?? null,
                amountCents: okData.amountCents ?? null,
                valueZar:
                  typeof okData.amountCents === "number" && okData.amountCents > 0
                    ? Math.round(okData.amountCents / 100)
                    : (completedSnapForAds?.total_zar ?? null),
                currency: okData.currency ?? "ZAR",
                email: okData.customerEmail ?? completedSnapForAds?.customer?.email ?? null,
                phone: completedSnapForAds?.customer?.phone ?? null,
              });
            } catch {
              // non-fatal — confirmation already shown
            }
            return true;
          }

          try {
            markRetargetingCandidate(false);
            clearStoredReferral("customer");
            clearBookingV2DraftStorage();
            consumeBookingV2SuccessRedirect();
          } catch {
            // non-fatal — payment succeeded; storage cleanup must not block UI
          }

          completedRef.current = true;
          setPhase("persist_pending");
          try {
            const refKey = String(okData.reference ?? reference ?? "").trim();
            const k = refKey ? `shalean_payment_persist_pending_${refKey}` : "";
            if (typeof sessionStorage !== "undefined" && k && !sessionStorage.getItem(k)) {
              sessionStorage.setItem(k, "1");
            }
            trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
              reference: okData.reference ?? null,
              booking_id: null,
              persist_pending: true,
              booking_saved: false,
            });
          } catch {
            // non-fatal
          }
          return true;
        }

        if (data.success === false && data.paymentStatus === "failed") {
          setErrorMessage((data as PaystackVerifyPostFailure).error ?? "Payment was not successful.");
          setPhase("failed");
          return false;
        }

        if (data.success === false && data.paymentStatus === "pending") {
          setErrorMessage((data as PaystackVerifyPostFailure).error ?? "Payment is still processing.");
          if (attempt < VERIFY_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
            continue;
          }
          setPhase("needs_retry");
          return false;
        }

        const failMsg = !res.ok
          ? `Request failed (${res.status}).`
          : data.success === false
            ? ((data as PaystackVerifyPostFailure).error ?? "Could not verify payment.")
            : "Could not verify payment.";
        setErrorMessage(failMsg);
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
          continue;
        }
        setPhase("needs_retry");
        return false;
      } catch (err) {
        if (runId !== runIdRef.current) return false;
        if (await recoverPersistedPaidBooking(runId)) return true;
        const aborted =
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError");
        setErrorMessage(aborted ? "Confirmation is taking longer than expected." : "Network error.");
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
          continue;
        }
        setPhase("needs_retry");
        return false;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (runId === runIdRef.current && (await recoverPersistedPaidBooking(runId))) return true;
    if (runId === runIdRef.current) setPhase("needs_retry");
    return false;
  }, [recoverPersistedPaidBooking, reference]);

  useEffect(() => {
    if (successPath === "area_review" || successPath === "missing") return;
    completedRef.current = false;
    const id = requestAnimationFrame(() => {
      if (successPath === "covered") {
        void finalizeCoveredBooking();
      } else {
        void finalizeBooking();
      }
    });
    return () => {
      cancelAnimationFrame(id);
      runIdRef.current += 1;
    };
  }, [successPath, finalizeBooking, finalizeCoveredBooking]);

  if (phase === "area_review") {
    const requestReference = bookingIdParam?.trim()
      ? bookingIdParam.trim().split("-")[0].toUpperCase()
      : null;

    return (
      <PageShell className="max-w-xl">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="px-6 pb-5 pt-7 text-center sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Area review
            </p>
            <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Request received
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              We&apos;ll check coverage and cleaner availability, then contact you to confirm your booking.
            </p>
            {requestReference ? (
              <p className="mt-3 text-xs text-zinc-500">
                Request reference <span className="font-semibold text-zinc-700 dark:text-zinc-300">{requestReference}</span>
              </p>
            ) : null}
          </div>

          <div className="border-y border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-8">
            <div className="grid grid-cols-3 gap-3 text-center text-xs text-zinc-600 dark:text-zinc-400">
              {[
                { Icon: Clock3, label: "Review area" },
                { Icon: CheckCircle2, label: "Check availability" },
                { Icon: MessageCircle, label: "Contact you" },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-6 py-5 sm:px-8">
            <div className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <CreditCard className="h-4 w-4 text-emerald-600" aria-hidden />
              <span>No payment has been taken.</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link
                href={bookingFlowHref("entry")}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                Back to booking
              </Link>
              <a
                href={`https://wa.me/${CUSTOMER_SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp us
              </a>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (phase === "missing") {
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">No reference</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Open this page from the payment confirmation, or start a new booking.
          </p>
          <Link
            href={bookingFlowHref("entry")}
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Back to booking
          </Link>
        </div>
      </PageShell>
    );
  }

  if (phase === "finalizing") {
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div
            className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">Confirming your booking…</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This usually takes a few seconds.</p>
        </div>
      </PageShell>
    );
  }

  if (phase === "failed") {
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Payment failed</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {errorMessage ?? "We couldn't confirm this payment."}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Retry
          </button>
          <Link href={bookingFlowHref("checkout", { register: "1" })} className="mt-3 block text-sm font-medium text-primary">
            Back to payment
          </Link>
        </div>
      </PageShell>
    );
  }

  if (phase === "needs_retry") {
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Still confirming…</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {errorMessage ?? "We couldn't finish saving your booking yet. You can try again."}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              if (successPath === "covered") void finalizeCoveredBooking();
              else void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Retry
          </button>
        </div>
      </PageShell>
    );
  }

  if (phase === "persist_pending" && statusData?.paymentStatus === "success") {
    // Do not show a money figure here — snapshot totals can differ from the
    // Paystack charge (promos/credits). Amount is confirmed on the success card.
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Payment received</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Your payment went through. We&apos;re saving your booking now — you don&apos;t need to pay again.
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Check again
          </button>
          <p className="mt-4 text-sm text-zinc-500">
            Need help?{" "}
            <a
              href={`https://wa.me/${CUSTOMER_SUPPORT_WHATSAPP_E164.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline underline-offset-2"
            >
              WhatsApp us
            </a>
            .
          </p>
        </div>
      </PageShell>
    );
  }

  if (phase !== "success" || !statusData || statusData.paymentStatus !== "success") {
    return (
      <PageShell>
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Checking your payment…</p>
      </PageShell>
    );
  }

  const snap = isSnapshot(statusData.bookingSnapshot)
    ? (statusData.bookingSnapshot as BookingSnapshotV1)
    : null;
  const persistedBookingId = statusData.bookingId?.trim() ?? "";
  const grossAmountZar =
    typeof (statusData as StatusPayload & { grossAmountZar?: number }).grossAmountZar === "number"
      ? (statusData as StatusPayload & { grossAmountZar?: number }).grossAmountZar ?? null
      : null;
  const cleaningCreditZar =
    typeof (statusData as StatusPayload & { cleaningCreditZar?: number }).cleaningCreditZar === "number"
      ? (statusData as StatusPayload & { cleaningCreditZar?: number }).cleaningCreditZar ?? null
      : null;
  const totalPaidZar = resolveCustomerTotalPaidZar({
    amountCents: statusData.amountCents,
    snapshotTotalZar: typeof snap?.total_zar === "number" ? snap.total_zar : null,
  });

  if (!persistedBookingId) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Payment received</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            We&apos;re finalising your booking. Check your email shortly.
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Check again
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <BookingConfirmationHero
        bookingReference={statusData.bookingReference ?? null}
        totalPaidZar={totalPaidZar}
        grossAmountZar={grossAmountZar}
        cleaningCreditZar={cleaningCreditZar}
        bookingId={persistedBookingId}
        hasSession={hasSession}
      />
    </PageShell>
  );
}

export default function BookingSuccessPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <PageShell>
            <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          </PageShell>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
