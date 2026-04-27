"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { formatLockedAppointmentLabel } from "@/lib/booking/lockedBooking";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import BookingContainer from "@/components/layout/BookingContainer";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { applyRebookSnapshot } from "@/lib/booking/rebookApply";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type {
  PaystackVerifyPostFailure,
  PaystackVerifyPostResponse,
  PaystackVerifyPostSuccess,
} from "@/lib/booking/paystackVerifyResponse";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { markRetargetingCandidate, trackGrowthEvent } from "@/lib/growth/trackEvent";
import { clearStoredReferral } from "@/lib/referrals/client";
import { CheckoutNoticeBanner } from "@/components/booking/CheckoutNoticeBanner";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_WHATSAPP_URL,
} from "@/lib/site/customerSupport";

const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_RETRY_DELAY_MS = 1500;

function SupportContactLinks({ layout = "column" }: { layout?: "column" | "row" }) {
  const flex =
    layout === "row"
      ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center"
      : "flex flex-col gap-2";
  return (
    <div className={flex}>
      <a
        href={CUSTOMER_SUPPORT_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:opacity-95 active:opacity-90"
      >
        WhatsApp support
      </a>
      <a
        href={`mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Booking help — Shalean")}`}
        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Email {CUSTOMER_SUPPORT_EMAIL}
      </a>
    </div>
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
  error?: string;
  upsertError?: string | null;
  assignmentType?: string | null;
  fallbackReason?: string | null;
  showCleanerSubstitutionNotice?: boolean;
  attemptedCleanerId?: string | null;
  assignedCleanerId?: string | null;
  selectedCleanerId?: string | null;
};

type Snapshot = {
  v?: number;
  locked?: LockedBooking;
  total_zar?: number;
  cleaner_name?: string | null;
};

function isSnapshot(v: unknown): v is Snapshot {
  return v !== null && typeof v === "object";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");

  const [phase, setPhase] = useState<
    "missing" | "finalizing" | "success" | "needs_retry" | "failed"
  >(() => (reference ? "finalizing" : "missing"));

  const [statusData, setStatusData] = useState<StatusPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitNote, setWaitNote] = useState(false);
  const [guestAccountNotice, setGuestAccountNotice] = useState<{
    tone: "danger" | "success";
    title: string;
    description: string;
  } | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
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
          setStatusData(mapVerifySuccessToStatus(data));
          setErrorMessage(null);
          setWaitNote(false);
          markRetargetingCandidate(false);
          clearStoredReferral("customer");
          trackGrowthEvent("complete_booking", {
            reference: data.reference ?? null,
            booking_id: data.bookingId ?? null,
            assignment_type: data.assignmentType ?? null,
            fallback_reason: data.fallbackReason ?? null,
            attempted_cleaner_id: data.attemptedCleanerId ?? null,
            assigned_cleaner_id: data.assignedCleanerId ?? null,
            selected_cleaner_id: data.selectedCleanerId ?? null,
          });
          trackGrowthEvent("booking_completed", {
            reference: data.reference ?? null,
            booking_id: data.bookingId ?? null,
            assignment_type: data.assignmentType ?? null,
            fallback_reason: data.fallbackReason ?? null,
            attempted_cleaner_id: data.attemptedCleanerId ?? null,
            assigned_cleaner_id: data.assignedCleanerId ?? null,
            selected_cleaner_id: data.selectedCleanerId ?? null,
          });
          setPhase("success");
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
      <BookingContainer className="py-12 sm:py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">No reference</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Open this page from the Paystack redirect, or return to your booking.
          </p>
          <Link
            href={bookingFlowHref("entry")}
            className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Back to booking
          </Link>
          <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Need to cancel or change a booking?
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Contact us on WhatsApp or email — no login required. Include your payment or booking reference if you have one.
            </p>
            <div className="mt-4">
              <SupportContactLinks />
            </div>
          </div>
        </div>
      </BookingContainer>
    );
  }

  if (phase === "finalizing") {
    return (
      <BookingContainer className="py-12 sm:py-16">
        <div className="text-center">
          <div className="mb-4 text-2xl" aria-hidden>
            ✔
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment received</p>
          <div
            className="mx-auto mt-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden
          />
          <p className="mt-4 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Confirming your booking…
          </p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This usually takes a few seconds.
          </p>
        </div>
      </BookingContainer>
    );
  }

  if (phase === "failed") {
    return (
      <BookingContainer className="py-12 sm:py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payment failed</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {errorMessage ?? "We couldn&apos;t confirm this payment."}
          </p>
          {reference ? (
            <p className="mt-4 font-mono text-xs text-zinc-500">
              Reference: {reference}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full max-w-xs justify-center rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-100"
          >
            Retry
          </button>
          <Link
            href={`${bookingFlowHref("checkout")}&register=1`}
            className="mt-3 block text-sm font-medium text-primary"
          >
            Back to payment
          </Link>
          <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Need to cancel or change your booking?
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Reach us on WhatsApp or email. Include your booking reference when contacting support.
            </p>
            <div className="mt-4">
              <SupportContactLinks />
            </div>
          </div>
        </div>
      </BookingContainer>
    );
  }

  if (phase === "needs_retry") {
    return (
      <BookingContainer className="py-12 sm:py-16">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            We&apos;re confirming your payment…
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {errorMessage ??
              "We couldn&apos;t finish saving your booking yet. You can try again — your payment may already be successful."}
          </p>
          {reference ? (
            <p className="mt-4 font-mono text-xs text-zinc-500">
              Reference: {reference}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setPhase("finalizing");
              void finalizeBooking();
            }}
            className="mt-6 inline-flex w-full max-w-xs justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Retry
          </button>
          <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-950/60">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Need to cancel or change your booking?
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Reach us on WhatsApp or email. Include your booking reference when contacting support.
            </p>
            <div className="mt-4">
              <SupportContactLinks />
            </div>
          </div>
        </div>
      </BookingContainer>
    );
  }

  if (phase !== "success" || !statusData || statusData.paymentStatus !== "success") {
    return (
      <BookingContainer className="py-12 sm:py-16">
        <div className="text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Checking your payment…</p>
        </div>
      </BookingContainer>
    );
  }

  const snap = isSnapshot(statusData.bookingSnapshot) ? statusData.bookingSnapshot : null;
  const locked = snap?.locked;
  const serviceLabel =
    locked?.service != null ? getServiceLabel(locked.service) : "Cleaning service";
  const when =
    locked && locked.date && locked.time
      ? formatLockedAppointmentLabel(locked as LockedBooking)
      : "—";
  const totalZarFromSnap = typeof snap?.total_zar === "number" ? snap.total_zar : null;
  const totalPaidZar =
    totalZarFromSnap ??
    (typeof statusData.amountCents === "number" && statusData.amountCents > 0
      ? Math.round(statusData.amountCents / 100)
      : null);

  const isGuest = !statusData.userId;
  const upgradeName =
    statusData.customerName?.trim() ||
    (snap && typeof snap === "object" && "customer" in snap
      ? String((snap as { customer?: { name?: string } }).customer?.name ?? "").trim()
      : "") ||
    "Customer";

  const showGuestUpgrade =
    isGuest &&
    !hasSession &&
    Boolean(statusData.customerEmail?.trim()) &&
    Boolean(reference);

  function handleBookAgain() {
    const snap = statusData?.bookingSnapshot as BookingSnapshotV1 | null | undefined;
    if (snap && applyRebookSnapshot(snap)) {
      router.push(bookingFlowHref("when"));
      return;
    }
    router.push(bookingFlowHref("entry"));
  }

  async function handleSaveDetails() {
    if (!statusData || !reference) return;
    const em = statusData.customerEmail?.trim();
    if (!em) return;
    setUpgradeLoading(true);
    try {
      const res = await fetch("/api/auth/create-from-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: em,
          name: upgradeName,
          reference,
        }),
      });
      const resBody = (await res.json()) as { error?: string };
      if (!res.ok) {
        void resBody;
        setGuestAccountNotice({
          tone: "danger",
          title: "Something went wrong",
          description: "We couldn’t send the account link. Please try again in a moment.",
        });
        return;
      }
      void resBody;
      setGuestAccountNotice({
        tone: "success",
        title: "Check your email",
        description: "We sent you a link to access your account.",
      });
    } finally {
      setUpgradeLoading(false);
    }
  }

  return (
    <BookingContainer className="py-10 sm:py-14">
      <CheckoutNoticeBanner
        open={guestAccountNotice != null}
        tone={guestAccountNotice?.tone ?? "danger"}
        title={guestAccountNotice?.title ?? ""}
        description={guestAccountNotice?.description ?? ""}
        onDismiss={() => setGuestAccountNotice(null)}
        autoDismissMs={guestAccountNotice?.tone === "success" ? 6000 : 5000}
      />
      <div className="text-center">
        <div className="mx-auto mb-4 text-3xl" aria-hidden>
          🎉
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Booking confirmed
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Check your email for the receipt
          {statusData.customerEmail ? ` (${statusData.customerEmail})` : ""}.
        </p>
        {statusData.showCleanerSubstitutionNotice ? (
          <p className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Your selected cleaner isn&apos;t available at that time — we&apos;ve assigned a similar top-rated cleaner.
          </p>
        ) : null}
        {statusData.bookingInDatabase === false ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Your payment succeeded. We&apos;re still saving your booking to our system — you should receive a
            confirmation email. If anything looks wrong, contact support with your reference below.
            {statusData.upsertError ? ` (${statusData.upsertError})` : ""}
          </p>
        ) : null}
        {statusData.bookingInDatabase !== false && statusData.upsertError ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400/90">
            Payment is confirmed, but we couldn&apos;t save all booking details automatically ({statusData.upsertError}).
            Contact support with your reference below.
          </p>
        ) : null}
        {waitNote && !statusData.upsertError ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400/90">
            Your payment is confirmed. If the confirmation email doesn&apos;t arrive within a few minutes, contact
            support with your reference below.
          </p>
        ) : null}
      </div>

      <section
        className="mx-auto mt-8 max-w-lg rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60 sm:p-5"
        aria-labelledby="cancel-change-heading"
      >
        <h2
          id="cancel-change-heading"
          className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Need to cancel or change your booking?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {isGuest
            ? "You booked as a guest — changes and cancellations are handled by our team."
            : "Changes and cancellations can be arranged through our team."}{" "}
          Use WhatsApp or email below; no login required for these messages.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {statusData.reference ? (
            <>
              Include your booking reference when contacting support:{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">{statusData.reference}</span>
            </>
          ) : (
            "Include your booking reference when contacting support (see your confirmation email or the summary below)."
          )}
        </p>
        <div className="mt-4">
          <SupportContactLinks layout="row" />
        </div>
      </section>

      {showGuestUpgrade ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 md:p-5 dark:border-blue-900/50 dark:bg-blue-950/35">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Save your details for next time
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Create an account with the same email — track bookings and book faster next time.
          </p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">No spam. We&apos;ll send a secure link to your inbox.</p>
          <button
            type="button"
            onClick={() => void handleSaveDetails()}
            disabled={upgradeLoading}
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {upgradeLoading ? "Setting up your account…" : "Save my details for next time"}
          </button>
          <p className="mt-3 text-center text-sm">
            <Link
              href={`/auth/signup?redirect=${encodeURIComponent("/dashboard/bookings")}`}
              className="font-medium text-primary hover:underline"
            >
              Or sign up with email &amp; password
            </Link>
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200/90 bg-white p-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Your booking summary
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Service</dt>
            <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">{serviceLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Date &amp; time</dt>
            <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">{when}</dd>
          </div>
          {locked?.location ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Location</dt>
              <dd className="max-w-[60%] text-right font-medium text-zinc-900 dark:text-zinc-100">
                {locked.location}
              </dd>
            </div>
          ) : null}
          {snap?.cleaner_name ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500 dark:text-zinc-400">Cleaner</dt>
              <dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">
                {snap.cleaner_name}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
            <dt className="font-medium text-zinc-800 dark:text-zinc-200">Total paid</dt>
            <dd className="text-right text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {totalPaidZar != null
                ? `R ${totalPaidZar.toLocaleString("en-ZA")}`
                : "—"}
              {statusData.currency ? (
                <span className="ml-1 text-xs font-normal text-zinc-500">{statusData.currency}</span>
              ) : null}
            </dd>
          </div>
        </dl>
        {statusData.reference ? (
          <p className="mt-4 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
            Ref: {statusData.reference}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => handleBookAgain()}
          className="inline-flex w-full max-w-xs justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 sm:w-auto"
        >
          Book this again in 10 seconds
        </button>
        {hasSession ? (
          <Link
            href="/dashboard/bookings"
            className="inline-flex w-full max-w-xs justify-center rounded-xl border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:text-zinc-100 sm:w-auto"
          >
            My bookings
          </Link>
        ) : null}
        <Link
          href="/"
          className="inline-flex w-full max-w-xs justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 sm:w-auto"
        >
          Home
        </Link>
      </div>
    </BookingContainer>
  );
}

export default function BookingSuccessPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <BookingContainer className="py-16">
            <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          </BookingContainer>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
