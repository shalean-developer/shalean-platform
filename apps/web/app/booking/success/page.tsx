"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { BadgeCheck, Calendar, Mail, MapPin, Sparkles, UserRound } from "lucide-react";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { formatLockedAppointmentLabel } from "@/lib/booking/lockedBooking";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import BookingContainer from "@/components/layout/BookingContainer";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { applyRebookSnapshot } from "@/lib/booking/rebookApply";
import type {
  BookingSnapshotDiscountLineV1,
  BookingSnapshotV1,
} from "@/lib/booking/paystackChargeTypes";
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

function isSnapshot(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseDiscountLinesFromSnapshot(bookingSnapshot: unknown): BookingSnapshotDiscountLineV1[] {
  if (!isSnapshot(bookingSnapshot)) return [];
  const raw = bookingSnapshot.discount_lines;
  if (!Array.isArray(raw)) return [];
  const out: BookingSnapshotDiscountLineV1[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const amount = typeof o.amount_zar === "number" ? o.amount_zar : Number(o.amount_zar);
    const label = typeof o.label === "string" ? o.label : "";
    const id = typeof o.id === "string" ? o.id : "discount";
    if (!label || !Number.isFinite(amount) || amount <= 0) continue;
    out.push({ id, label, amount_zar: Math.round(amount) });
  }
  return out;
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
          try {
            const refKey = String(data.reference ?? reference ?? "").trim();
            const k = refKey ? `shalean_payment_completed_${refKey}` : "";
            if (typeof sessionStorage !== "undefined" && k) {
              if (!sessionStorage.getItem(k)) {
                sessionStorage.setItem(k, "1");
                trackGrowthEvent("payment_completed", {
                  reference: data.reference ?? null,
                  booking_id: data.bookingId ?? null,
                });
              }
            } else {
              trackGrowthEvent("payment_completed", {
                reference: data.reference ?? null,
                booking_id: data.bookingId ?? null,
              });
            }
          } catch {
            trackGrowthEvent("payment_completed", {
              reference: data.reference ?? null,
              booking_id: data.bookingId ?? null,
            });
          }
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
            href={bookingFlowHref("checkout", { register: "1" })}
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

  const snap = isSnapshot(statusData.bookingSnapshot)
    ? (statusData.bookingSnapshot as BookingSnapshotV1)
    : null;
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

  const discountZar =
    snap && typeof snap.discount_zar === "number" && snap.discount_zar > 0 ? Math.round(snap.discount_zar) : null;
  const promoCodeRaw = snap && typeof snap.promo_code === "string" ? snap.promo_code.trim() : "";
  const promoCode = promoCodeRaw ? promoCodeRaw.toUpperCase() : null;

  const tipZar =
    snap && typeof snap.tip_zar === "number" && Number.isFinite(snap.tip_zar) && snap.tip_zar > 0
      ? Math.round(snap.tip_zar)
      : 0;
  const visitTotalZar =
    snap && typeof snap.visit_total_zar === "number" && Number.isFinite(snap.visit_total_zar)
      ? Math.round(snap.visit_total_zar)
      : totalPaidZar != null && discountZar != null
        ? totalPaidZar + discountZar - tipZar
        : null;

  const parsedDiscountLines = snap ? parseDiscountLinesFromSnapshot(snap) : [];
  const displayDiscountLines: BookingSnapshotDiscountLineV1[] =
    parsedDiscountLines.length > 0
      ? parsedDiscountLines
      : discountZar != null && discountZar > 0
        ? [
            {
              id: "legacy",
              label: promoCode ? `Promo · ${promoCode}` : "Discounts",
              amount_zar: discountZar,
            },
          ]
        : [];

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
    <BookingContainer className="py-8 sm:py-12">
      <CheckoutNoticeBanner
        open={guestAccountNotice != null}
        tone={guestAccountNotice?.tone ?? "danger"}
        title={guestAccountNotice?.title ?? ""}
        description={guestAccountNotice?.description ?? ""}
        onDismiss={() => setGuestAccountNotice(null)}
        autoDismissMs={guestAccountNotice?.tone === "success" ? 6000 : 5000}
      />

      <div className="mx-auto max-w-lg space-y-5 md:max-w-xl">
        {statusData.showCleanerSubstitutionNotice ? (
          <p className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Your selected cleaner isn&apos;t available at that time — we&apos;ve assigned a similar top-rated cleaner.
          </p>
        ) : null}
        {statusData.bookingInDatabase === false ? (
          <p className="rounded-2xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Your payment succeeded. We&apos;re still saving your booking to our system — you should receive a confirmation
            email. If anything looks wrong, contact support with your reference below.
            {statusData.upsertError ? ` (${statusData.upsertError})` : ""}
          </p>
        ) : null}
        {statusData.bookingInDatabase !== false && statusData.upsertError ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100/95">
            Payment is confirmed, but we couldn&apos;t save all booking details automatically ({statusData.upsertError}).
            Contact support with your reference below.
          </p>
        ) : null}
        {waitNote && !statusData.upsertError ? (
          <p className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/45 dark:bg-amber-950/35 dark:text-amber-100/95">
            Your payment is confirmed. If the confirmation email doesn&apos;t arrive within a few minutes, contact support
            with your reference below.
          </p>
        ) : null}

        <header className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-sky-50/50 px-6 pb-8 pt-10 text-center shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/45 dark:via-zinc-950 dark:to-zinc-900/90">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl dark:bg-emerald-400/10"
            aria-hidden
          />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-700/25 ring-4 ring-emerald-500/15 dark:bg-emerald-500 dark:ring-emerald-400/10">
            <BadgeCheck className="h-9 w-9" strokeWidth={2.25} aria-hidden />
          </div>
          <h1 className="relative mt-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Booking confirmed
          </h1>
          <p className="relative mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Thanks for choosing Shalean. We&apos;ve emailed your receipt
            {statusData.customerEmail ? (
              <>
                {" "}
                to <span className="font-medium text-zinc-800 dark:text-zinc-200">{statusData.customerEmail}</span>
              </>
            ) : null}
            .
          </p>
          <div className="relative mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/90 px-4 py-2 text-xs font-medium text-emerald-900 shadow-sm dark:border-emerald-800/60 dark:bg-zinc-900/80 dark:text-emerald-100/90">
            <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Receipt in your inbox
          </div>
        </header>

        <section
          className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 sm:p-6"
          aria-labelledby="visit-details-heading"
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
            <h2 id="visit-details-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Visit details
            </h2>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            <div className="flex gap-3 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Sparkles className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Service</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{serviceLabel}</p>
              </div>
            </div>
            <div className="flex gap-3 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <Calendar className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Date &amp; time</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{when}</p>
              </div>
            </div>
            {locked?.location ? (
              <div className="flex gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  <MapPin className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Location</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                    {locked.location}
                  </p>
                </div>
              </div>
            ) : null}
            {locked || snap?.cleaner_name?.trim() ? (
              <div className="flex gap-3 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  <UserRound className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cleaner</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {snap?.cleaner_name?.trim() || (locked ? "Auto-assigned cleaner" : "—")}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-2 rounded-xl bg-zinc-50 px-4 py-4 dark:bg-zinc-900/60">
            {visitTotalZar != null ? (
              <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span>Visit subtotal</span>
                <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  R {visitTotalZar.toLocaleString("en-ZA")}
                </span>
              </div>
            ) : null}
            {tipZar > 0 ? (
              <div className="mb-3 flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span>Tip</span>
                <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                  R {tipZar.toLocaleString("en-ZA")}
                </span>
              </div>
            ) : null}
            {displayDiscountLines.length > 0 ? (
              <ul className="mb-3 space-y-2.5 border-b border-zinc-200/80 pb-3 dark:border-zinc-700/80">
                {displayDiscountLines.map((line) => (
                  <li
                    key={`${line.id}-${line.label}`}
                    className="flex items-start justify-between gap-3 text-sm leading-snug"
                  >
                    <span className="min-w-0 flex-1 font-medium text-emerald-800 dark:text-emerald-300/95">
                      {line.label}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      −R {line.amount_zar.toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Total paid</span>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                {totalPaidZar != null ? `R ${totalPaidZar.toLocaleString("en-ZA")}` : "—"}
                {statusData.currency ? (
                  <span className="ml-1.5 align-middle text-xs font-medium text-zinc-500">{statusData.currency}</span>
                ) : null}
              </span>
            </div>
          </div>

          {statusData.reference ? (
            <div className="mt-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Booking reference</p>
              <p className="mt-1 break-all font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200">
                {statusData.reference}
              </p>
            </div>
          ) : null}
        </section>

        <section
          className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-6"
          aria-labelledby="cancel-change-heading"
        >
          <h2 id="cancel-change-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Reschedule or cancel
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {isGuest
              ? "Guest booking — our team handles changes on WhatsApp or email."
              : "Changes go through our team on WhatsApp or email."}{" "}
            No login needed for these messages.
          </p>
          {statusData.reference ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Include reference <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{statusData.reference}</span> when you reach out.
            </p>
          ) : null}
          <div className="mt-4">
            <SupportContactLinks layout="row" />
          </div>
        </section>

        {showGuestUpgrade ? (
          <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50 to-white p-5 dark:border-blue-900/50 dark:from-blue-950/40 dark:to-zinc-950 md:p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Save your details for next time</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Create an account with the same email — track bookings and book faster next time.
            </p>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">No spam. We&apos;ll send a secure link to your inbox.</p>
            <button
              type="button"
              onClick={() => void handleSaveDetails()}
              disabled={upgradeLoading}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-60"
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

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={() => handleBookAgain()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 sm:w-auto sm:min-w-[200px]"
          >
            Book this again
          </button>
          {hasSession ? (
            <Link
              href="/dashboard/bookings"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 sm:w-auto sm:min-w-[160px]"
            >
              My bookings
            </Link>
          ) : null}
          <Link
            href="/"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-primary/25 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/15 sm:w-auto sm:min-w-[140px]"
          >
            Home
          </Link>
        </div>
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
