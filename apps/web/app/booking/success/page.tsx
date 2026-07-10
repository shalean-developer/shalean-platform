"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
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
import { clearStoredReferral } from "@/lib/referrals/client";
import { BookingConfirmationHero } from "@/components/booking/BookingConfirmationHero";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { CUSTOMER_SUPPORT_WHATSAPP_E164 } from "@/lib/site/customerSupport";
const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_RETRY_DELAY_MS = 1500;

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
};

function isSnapshot(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Paystack paid and a `bookings` row exists — safe to show “booking confirmed” funnel and copy. */function isBookingPersisted(data: PaystackVerifyPostSuccess): boolean {
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
    upsertError: data.upsertError,    assignmentType: data.assignmentType ?? null,
    fallbackReason: data.fallbackReason ?? null,
    showCleanerSubstitutionNotice: Boolean(data.showCleanerSubstitutionNotice),
    attemptedCleanerId: data.attemptedCleanerId ?? null,
    assignedCleanerId: data.assignedCleanerId ?? null,
    selectedCleanerId: data.selectedCleanerId ?? null,
  };
}

function SuccessContent() {
  const searchParams = useSearchParams();  const reference = searchParams.get("reference") ?? searchParams.get("trxref");

  const [phase, setPhase] = useState<
    "missing" | "finalizing" | "success" | "persist_pending" | "needs_retry" | "failed"
  >(() => (reference ? "finalizing" : "missing"));

  const [statusData, setStatusData] = useState<StatusPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  const finalizeBooking = useCallback(async (): Promise<boolean> => {
    if (!reference) return false;
    setPhase("finalizing");

    for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });

        const data = (await res.json()) as PaystackVerifyPostResponse;

        if (res.ok && data.success && data.paymentStatus === "success") {
          const okData = data as PaystackVerifyPostSuccess;
          setStatusData(mapVerifySuccessToStatus(okData));
          setErrorMessage(null);          markRetargetingCandidate(false);
          clearStoredReferral("customer");

          if (isBookingPersisted(okData)) {
            trackGrowthEvent(ANALYTICS_EVENTS.COMPLETE_BOOKING, {
              reference: okData.reference ?? null,
              booking_id: okData.bookingId ?? null,
              assignment_type: okData.assignmentType ?? null,
              fallback_reason: okData.fallbackReason ?? null,
              attempted_cleaner_id: okData.attemptedCleanerId ?? null,
              assigned_cleaner_id: okData.assignedCleanerId ?? null,
              selected_cleaner_id: okData.selectedCleanerId ?? null,
            });
            const completedSnap = isSnapshot(okData.bookingSnapshot)
              ? (okData.bookingSnapshot as BookingSnapshotV1)
              : null;
            const completedLocked = completedSnap?.locked;
            trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_COMPLETED, completedLocked, {
              reference: okData.reference ?? null,
              booking_id: okData.bookingId ?? null,
              service_type: completedLocked?.service_type ?? completedLocked?.service ?? completedSnap?.flat?.service ?? null,
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
            try {
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
            } catch {
              trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
                reference: okData.reference ?? null,
                booking_id: okData.bookingId ?? null,
                booking_saved: true,
              });
            }
            const completedSnapForAds = isSnapshot(okData.bookingSnapshot)
              ? (okData.bookingSnapshot as BookingSnapshotV1)
              : null;
            trackClientPurchase({
              reference: String(okData.reference ?? reference ?? "").trim(),
              bookingId: okData.bookingId ?? null,
              amountCents: okData.amountCents ?? null,
              valueZar: completedSnapForAds?.total_zar ?? null,
              currency: okData.currency ?? "ZAR",
              email: okData.customerEmail ?? completedSnapForAds?.customer?.email ?? null,
              phone: completedSnapForAds?.customer?.phone ?? null,
            });
            setPhase("success");
            return true;
          }

          try {
            const refKey = String(okData.reference ?? reference ?? "").trim();
            const k = refKey ? `shalean_payment_persist_pending_${refKey}` : "";
            if (typeof sessionStorage !== "undefined" && k) {
              if (!sessionStorage.getItem(k)) {
                sessionStorage.setItem(k, "1");
                trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
                  reference: okData.reference ?? null,
                  booking_id: null,
                  persist_pending: true,
                  booking_saved: false,
                });
              }
            } else {
              trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
                reference: okData.reference ?? null,
                booking_id: null,
                persist_pending: true,
                booking_saved: false,
              });
            }
          } catch {
            trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
              reference: okData.reference ?? null,
              booking_id: null,
              persist_pending: true,
              booking_saved: false,
            });
          }
          setPhase("persist_pending");
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
      } catch {
        setErrorMessage("Network error.");
        if (attempt < VERIFY_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, VERIFY_RETRY_DELAY_MS));
          continue;
        }
        setPhase("needs_retry");
        return false;
      }
    }

    setPhase("needs_retry");
    return false;
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    const id = requestAnimationFrame(() => {
      void finalizeBooking();
    });
    return () => cancelAnimationFrame(id);
  }, [reference, finalizeBooking]);

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
              void finalizeBooking();
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
    const snapP = isSnapshot(statusData.bookingSnapshot)
      ? (statusData.bookingSnapshot as BookingSnapshotV1)
      : null;
    const totalZarP =
      typeof snapP?.total_zar === "number"
        ? snapP.total_zar
        : typeof statusData.amountCents === "number" && statusData.amountCents > 0
          ? Math.round(statusData.amountCents / 100)
          : null;

    return (
      <PageShell>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Payment received</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Your payment went through. We&apos;re saving your booking now — you don&apos;t need to pay again.
          </p>
          {totalZarP != null ? (
            <p className="mt-4 text-lg font-bold tabular-nums text-primary">R{totalZarP.toLocaleString("en-ZA")}</p>
          ) : null}
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
  const totalZarFromSnap = typeof snap?.total_zar === "number" ? snap.total_zar : null;
  const totalPaidZar =
    totalZarFromSnap ??
    (typeof statusData.amountCents === "number" && statusData.amountCents > 0
      ? Math.round(statusData.amountCents / 100)
      : null);

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