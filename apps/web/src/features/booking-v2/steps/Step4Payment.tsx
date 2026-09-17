"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, ShieldCheck, CreditCard, Lock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, signUp, getUser, getSession } from "@/lib/auth/authClient";
import { signInSchema, signUpSchema, type SignInData, type SignUpData } from "@/src/features/booking-v2/schemas";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { useFormContext } from "react-hook-form";
import { CustomerPriceBreakdown } from "@/src/features/booking-v2/components/CustomerPriceBreakdown";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import type { User } from "@supabase/supabase-js";
import {
  ANALYTICS_EVENTS,
  BOOKING_FUNNEL_ROW,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { useStoredReferralCheckoutDiscount } from "@/hooks/useStoredReferralCheckoutDiscount";
import { getStoredReferral } from "@/lib/referrals/client";
import {
  bookingV2CoveredSuccessHref,
  bookingV2SuccessHref,
  clearBookingV2DraftStorage,
  consumeBookingV2SuccessRedirect,
} from "@/lib/booking-v2/bookingV2PaymentRedirect";
import { assessBookingQuoteReadiness } from "@/lib/booking-v2/bookingQuoteReadiness";
import { buildRecurringPrepaymentQuote } from "@/lib/recurring/recurringPrepayment";

// ??? Auth Form ?????????????????????????????????????????????????????????????????

type AuthMode = "sign_in" | "sign_up";
type AuthMessage = { tone: "error" | "success"; text: string };

type PendingPaymentSummary = {
  bookingId: string;
  status: string;
  paymentStatus: string;
  paid: boolean;
  serviceLabel: string;
  address: string;
  amountZar: number;
  pricingSummary: CustomerPricingBreakdown | null;
};

function friendlySignInError(message?: string): string {
  if (message?.toLowerCase().includes("invalid login credentials")) {
    return "The email or password is incorrect. Try again or reset your password.";
  }
  return message ?? "Sign in failed. Check your details and try again.";
}

function friendlySignUpError(message?: string): string {
  if (message?.toLowerCase().includes("already registered")) {
    return "An account already exists for this email. Sign in or reset your password.";
  }
  return message ?? "Account creation failed. Please try again.";
}

function AuthGate({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);
  const [loading, setLoading] = useState(false);

  const signInForm = useForm<SignInData>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpData>({ resolver: zodResolver(signUpSchema) });

  async function handleSignIn(data: SignInData) {
    setLoading(true);
    setAuthMessage(null);
    const { user, session, error } = await signIn(data.email, data.password);
    setLoading(false);
    if (error || !user || !session?.access_token) {
      setAuthMessage({ tone: "error", text: friendlySignInError(error?.message) });
      return;
    }
    onAuthenticated(user);
  }

  async function handleSignUp(data: SignUpData) {
    setLoading(true);
    setAuthMessage(null);
    const { user, session, error } = await signUp(data.email, data.password, data.fullName, data.phone ?? "");
    setLoading(false);
    if (error) {
      setAuthMessage({ tone: "error", text: friendlySignUpError(error.message) });
      return;
    }
    // Supabase returns a user without a session when email confirmation is required.
    // Do not advance to payment — Paystack confirm needs a live access token.
    if (!session?.access_token || !user) {
      signInForm.setValue("email", data.email);
      setMode("sign_in");
      setAuthMessage({
        tone: "success",
        text: "Account created. Check your email to confirm it, then sign in to continue.",
      });
      return;
    }
    onAuthenticated(user);
  }

  function switchMode(nextMode: AuthMode) {
    if (nextMode === mode) return;
    const email = mode === "sign_in" ? signInForm.getValues("email") : signUpForm.getValues("email");
    if (email) {
      if (nextMode === "sign_in") signInForm.setValue("email", email);
      else signUpForm.setValue("email", email);
    }
    setMode(nextMode);
    setAuthMessage(null);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold tracking-tight text-slate-900">
          {mode === "sign_in" ? "Welcome back!" : "Create your account"}
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
          Your booking is saved. {mode === "sign_in" ? "Sign in to continue to payment." : "Create your account to continue to payment."}
        </p>
      </div>

      {/* Authentication status */}
      {authMessage && (
        <div
          role={authMessage.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
            authMessage.tone === "error"
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {authMessage.tone === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {authMessage.text}
        </div>
      )}

      {mode === "sign_in" ? (
        <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-5">
          <div>
            <label htmlFor="si-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="si-email"
              type="email"
              autoComplete="section-booking-signin email"
              placeholder="you@example.com"
              {...signInForm.register("email")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {signInForm.formState.errors.email && (
              <p className="mt-1 text-xs text-red-500">{signInForm.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="si-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="si-password"
              autoComplete="section-booking-signin current-password"
              placeholder="Enter your password"
              {...signInForm.register("password")}
              className="rounded-xl border-slate-200 py-2.5 text-sm shadow-sm focus-visible:outline-blue-500"
            />
            {signInForm.formState.errors.password && (
              <p className="mt-1 text-xs text-red-500">{signInForm.formState.errors.password.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-5">
          <div>
            <label htmlFor="su-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="su-name"
              type="text"
              autoComplete="section-booking-signup name"
              placeholder="Jane Doe"
              {...signUpForm.register("fullName")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {signUpForm.formState.errors.fullName && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.fullName.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              id="su-phone"
              type="tel"
              autoComplete="section-booking-signup tel"
              placeholder="082 123 4567"
              {...signUpForm.register("phone")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {signUpForm.formState.errors.phone && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.phone.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              id="su-email"
              type="email"
              autoComplete="section-booking-signup email"
              placeholder="you@example.com"
              {...signUpForm.register("email")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {signUpForm.formState.errors.email && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="su-password"
              autoComplete="section-booking-signup new-password"
              placeholder="At least 8 characters"
              {...signUpForm.register("password")}
              className="rounded-xl border-slate-200 py-2.5 text-sm shadow-sm focus-visible:outline-blue-500"
            />
            {signUpForm.formState.errors.password && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.password.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Creating account…" : "Create account & continue"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500">
        {mode === "sign_in" ? "New to Shalean?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => switchMode(mode === "sign_in" ? "sign_up" : "sign_in")}
          disabled={loading}
          className="font-semibold text-blue-600 hover:underline disabled:opacity-60"
        >
          {mode === "sign_in" ? "Create account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

// ??? Payment section ????????????????????????????????????????????????????????????

function PaymentSection({
  user,
  onSessionLost,
}: {
  user: User;
  onSessionLost: (message: string) => void;
}) {
  const { serviceSlug, clearBooking, catalogLoading } = useBookingV2();
  const { watch, setValue } = useFormContext<BookingV2FormData>();
  const values = watch();
  const config = SERVICE_CONFIG[serviceSlug];
  const quoteReadiness = assessBookingQuoteReadiness({
    catalogLoading,
    pricingSummary: values.pricingSummary,
  });

  // Recover if Paystack onSuccess cleared mid-navigation (HMR / Fast Refresh remount).
  useEffect(() => {
    const pending = consumeBookingV2SuccessRedirect();
    if (!pending) return;
    window.location.replace(bookingV2SuccessHref(pending));
  }, []);

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingIdState] = useState<string | null>(
    () => values.pendingBookingId?.trim() || null,
  );
  const [pendingSummary, setPendingSummary] = useState<PendingPaymentSummary | null>(null);
  const [pendingSummaryError, setPendingSummaryError] = useState<string | null>(null);
  const pendingSummaryLoading = Boolean(pendingBookingId && !pendingSummary && !pendingSummaryError);
  const canStartPayment = pendingBookingId ? Boolean(pendingSummary && !pendingSummaryLoading) : quoteReadiness.ready;

  function setPendingBookingId(id: string | null) {
    setPendingSummary(null);
    setPendingSummaryError(null);
    setPendingBookingIdState(id);
    setValue("pendingBookingId", id, { shouldDirty: false, shouldValidate: false });
  }

  // Restore pending booking after Paystack redirect cancel / remount.
  useEffect(() => {
    const stored = values.pendingBookingId?.trim();
    if (stored && !pendingBookingId) setPendingBookingIdState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / draft hydrate only
  }, []);

  // A pending booking has a canonical server-owned price. Never render or retry it
  // using a tab-local draft, which can differ across tabs or after stale hydration.
  useEffect(() => {
    if (!pendingBookingId) return;

    let active = true;
    void (async () => {
      try {
        const session = await getSession();
        if (!session?.access_token) {
          if (active) onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
          return;
        }
        const res = await fetch(`/api/bookings/${encodeURIComponent(pendingBookingId)}/payment-summary`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const json = (await res.json()) as PendingPaymentSummary & { error?: string };
        if (!active) return;
        if (res.status === 401) {
          onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
          return;
        }
        if (!res.ok || json.bookingId !== pendingBookingId || !Number.isFinite(json.amountZar)) {
          setPendingSummaryError(json.error ?? "Could not load the saved booking total. Please return to Review.");
          return;
        }
        setPendingSummary(json);
      } catch {
        if (active) setPendingSummaryError("Could not load the saved booking total. Please refresh this page and try again.");
      }
    })();

    return () => {
      active = false;
    };
  }, [onSessionLost, pendingBookingId]);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredit, setApplyCredit] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscountZar, setPromoDiscountZar] = useState(0);
  const [promoLabel, setPromoLabel] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const baseTotal = values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? config.basePrice;
  const recurringPrepayment = values.bookingType === "recurring" && values.recurringFrequency
    ? buildRecurringPrepaymentQuote({
        startDate: values.recurringStartDate || values.date,
        frequency: values.recurringFrequency,
        recurringDays: values.recurringDays ?? [],
        perVisitZar: baseTotal,
      })
    : null;
  const checkoutSubtotal = recurringPrepayment?.grossPackageZar ?? baseTotal;
  const { referralDiscount, loading: referralLoading, invalidMessage } = useStoredReferralCheckoutDiscount({
    email: user.email,
    bookingTotalZar: Math.max(0, checkoutSubtotal - promoDiscountZar),
    serviceSlug,
  });

  const referralToApply = referralDiscount?.discountZar ?? 0;
  const totalAfterPromo = Math.max(0, checkoutSubtotal - promoDiscountZar);
  const totalAfterReferral = Math.max(0, totalAfterPromo - referralToApply);
  const creditToApply = applyCredit ? Math.min(creditBalance, totalAfterReferral) : 0;
  const payTotal = Math.max(0, totalAfterReferral - creditToApply);
  const displayedPricing = pendingBookingId ? pendingSummary?.pricingSummary ?? null : values.pricingSummary;
  const displayedTotal = pendingBookingId ? pendingSummary?.amountZar ?? null : payTotal;
  const promotionRequestKey = JSON.stringify({
    serviceSlug,
    selectedExtras: [...(values.selectedExtras ?? [])].sort(),
    subtotalZar: checkoutSubtotal,
    customerEmail: user.email?.trim().toLowerCase() ?? "",
  });
  const activePromotionRequestKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await getSession();
        if (!session?.access_token || controller.signal.aborted) return;
        const res = await fetch("/api/referrals/credit", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        if (res.ok && !controller.signal.aborted) {
          const j = (await res.json()) as { balance?: number };
          setCreditBalance(Number(j.balance ?? 0));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        throw error;
      }
    })();
    return () => controller.abort();
  }, []);

  // Auto-apply eligible promotions (first booking, bundles, membership) on load
  useEffect(() => {
    if (activePromotionRequestKey.current === promotionRequestKey) return;
    activePromotionRequestKey.current = promotionRequestKey;
    const controller = new AbortController();
    void (async () => {
      try {
        const session = await getSession();
        const res = await fetch("/api/promotions/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            serviceSlug,
            selectedExtraIds: values.selectedExtras ?? [],
            subtotalZar: checkoutSubtotal,
            customerEmail: user.email,
          }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const j = (await res.json()) as {
          totalDiscountZar?: number;
          applied?: { name: string; discountZar: number; source: string }[];
          rejected?: { reason: string }[];
        };
        const autoOnly = (j.applied ?? []).filter((a) => a.source !== "code");
        const total = autoOnly.reduce((sum, a) => sum + Math.round(Number(a.discountZar ?? 0)), 0);
        if (total > 0 && autoOnly.length) {
          setPromoDiscountZar(total);
          setPromoLabel(autoOnly.map((a) => a.name).join(", "));
          setPromoError(null);
        } else {
          setPromoDiscountZar(0);
          setPromoLabel(null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    })();
    return () => {
      controller.abort();
      if (activePromotionRequestKey.current === promotionRequestKey) {
        activePromotionRequestKey.current = null;
      }
    };
    // Request identity is intentionally represented by one stable serialized key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionRequestKey]);

  async function applyPromoCode() {
    setPromoChecking(true);
    setPromoError(null);
    try {
      const session = await getSession();
      const res = await fetch("/api/promotions/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          serviceSlug,
          selectedExtraIds: values.selectedExtras ?? [],
          subtotalZar: checkoutSubtotal,
          customerEmail: user.email,
          promoCode: promoCode.trim(),
        }),
      });
      const j = (await res.json()) as {
        totalDiscountZar?: number;
        applied?: { name: string; discountZar: number }[];
        rejected?: { reason: string }[];
        error?: string;
      };
      if (!res.ok) {
        setPromoError(j.error ?? "Could not validate code.");
        setPromoDiscountZar(0);
        setPromoLabel(null);
        return;
      }
      const total = Math.round(Number(j.totalDiscountZar ?? 0));
      if (total <= 0) {
        setPromoError(j.rejected?.[0]?.reason ?? "This code is not valid for your booking.");
        setPromoDiscountZar(0);
        setPromoLabel(null);
        return;
      }
      setPromoDiscountZar(total);
      setPromoLabel((j.applied ?? []).map((a) => a.name).join(", ") || "Promotion applied");
    } finally {
      setPromoChecking(false);
    }
  }

  // Recovery may safely spend up to 12s verifying the previous Paystack reference
  // and another 12s initializing its replacement. Keep the browser deadline above
  // that server-side maximum so it does not manufacture a false timeout while the
  // idempotency protection is still completing.
  const PAYMENT_RECOVERY_TIMEOUT_MS = 30_000;
  const BOOKING_CONFIRM_TIMEOUT_MS = 30_000;

  async function fetchPaymentPreparation(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function handleConfirmAndPay() {
    // A saved booking already has a server-owned canonical amount. Do not block its
    // idempotent payment-session recovery when the client quote catalogue is unavailable.
    if (!pendingBookingId && !quoteReadiness.ready) {
      setError(quoteReadiness.message ?? "Your quote is not ready. Please refresh pricing.");
      return;
    }
    setConfirming(true);
    setError(null);
    let confirmedBookingId = pendingBookingId;
    let paymentAccessToken = "";

    try {
      // 1. Confirm booking and get bookingId + paystackReference
      let session = await getSession();
      const expiresSoon =
        typeof session?.expires_at === "number" && session.expires_at <= Math.floor(Date.now() / 1000) + 30;
      if (!session?.access_token || expiresSoon) {
        try {
          const { getSupabaseBrowser } = await import("@/lib/supabase/browser");
          const sb = getSupabaseBrowser();
          if (sb) {
            const refreshed = await sb.auth.refreshSession();
            session = refreshed.data.session ?? null;
          }
        } catch {
          session = null;
        }
      }
      if (!session?.access_token) {
        onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
        setConfirming(false);
        return;
      }
      paymentAccessToken = session.access_token;

      // Retry path: booking already created — recover Paystack session instead of inserting again.
      if (pendingBookingId) {
        const sessRes = await fetchPaymentPreparation(`/api/bookings/${encodeURIComponent(pendingBookingId)}/payment-session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }, PAYMENT_RECOVERY_TIMEOUT_MS);
        const sessJson = (await sessRes.json()) as {
          status?: string;
          authorizationUrl?: string;
          reference?: string;
          error?: string;
          errorCode?: string;
          message?: string;
          code?: string;
        };
        if (sessRes.status === 401) {
          onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
          setConfirming(false);
          return;
        }
        if (sessJson.status === "paid") {
          const ref = (sessJson.reference ?? "").trim();
          clearBookingV2DraftStorage();
          window.location.assign(bookingV2SuccessHref(ref || pendingBookingId, pendingBookingId));
          return;
        }
        if (sessJson.status === "ready" && sessJson.authorizationUrl?.trim()) {
          if (sessJson.message) setError(sessJson.message);
          trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED, {
            service: serviceSlug,
            service_type: serviceSlug,
            serviceAreaName: values.suburb ?? null,
            finalPrice: values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? null,
            extras: values.selectedExtras ?? null,
          }, {
            service_type: serviceSlug,
            suburb: values.suburb ?? null,
            estimated_price: values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? null,
            booking_id: pendingBookingId,
          });
          window.location.assign(sessJson.authorizationUrl.trim());
          return;
        }
        const notFound =
          sessRes.status === 404 ||
          sessJson.errorCode === "PAYMENT_BOOKING_NOT_FOUND" ||
          sessJson.code === "PAYMENT_BOOKING_NOT_FOUND" ||
          /could not find this booking/i.test(sessJson.error ?? "");
        if (notFound) {
          // Pending row gone — only fall through when a new canonical quote is ready.
          setPendingBookingId(null);
          if (!quoteReadiness.ready) {
            setError(quoteReadiness.message ?? "Your quote is not ready. Please refresh pricing.");
            setConfirming(false);
            return;
          }
        } else {
          setError(
            sessJson.error?.trim() ||
              "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
          );
          setConfirming(false);
          return;
        }
      }

      const confirmRes = await fetchPaymentPreparation("/api/booking-v2/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...values,
          applyCleaningCreditZar: creditToApply,
          // Omit when unset ? Zod optional strings reject JSON `null` from getStoredReferral.
          referralCode:
            (referralDiscount?.code ?? getStoredReferral("customer") ?? "").trim() || undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      }, BOOKING_CONFIRM_TIMEOUT_MS);

      const confirmJson = (await confirmRes.json()) as {
        success?: boolean;
        bookingId?: string;
        paystackReference?: string;
        payAmountZar?: number;
        pricingSummary?: BookingV2FormData["pricingSummary"];
        creditAppliedZar?: number;
        requiresPayment?: boolean;
        paymentPreparationToken?: string;
        error?: string;
        code?: string;
        fulfillmentMode?: string;
        customerMessage?: string;
      };

      if (confirmRes.status === 401) {
        onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
        setConfirming(false);
        return;
      }

      if (confirmRes.status === 409 && confirmJson.code === "AREA_REVIEW_REQUIRED") {
        const areaRes = await fetch("/api/booking-v2/area-review", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            serviceSlug: values.serviceSlug,
            address: values.address,
            suburb: values.suburb,
            city: values.city,
            postalCode: values.postalCode,
            serviceAreaLocationId: values.serviceAreaLocationId || null,
            serviceAreaCityId: values.serviceAreaCityId || null,
            date: values.date,
            time: values.time,
            contactPhone: values.contactPhone,
            serviceDetails: values.serviceDetails,
          }),
        });
        const areaJson = (await areaRes.json()) as {
          success?: boolean;
          bookingId?: string;
          customerMessage?: string;
          error?: string;
        };
        if (areaRes.ok && areaJson.success && areaJson.bookingId) {
          // Area-review requests are not confirmed bookings — do not emit booking_submitted.
          window.location.href = `/account/success?areaReview=1&bookingId=${encodeURIComponent(areaJson.bookingId)}`;
          return;
        }
        setError(areaJson.error ?? confirmJson.customerMessage ?? confirmJson.error ?? "Could not submit area review.");
        setConfirming(false);
        return;
      }

      if (!confirmRes.ok || !confirmJson.success || !confirmJson.bookingId) {
        const message = confirmJson.error ?? "Could not create your booking. Please try again.";
        setError(message);
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
          flow: "booking_v2",
          action: "confirm_booking",
          message,
        });
        setConfirming(false);
        return;
      }

      const { paystackReference, bookingId } = confirmJson;
      setPendingBookingId(bookingId);
      confirmedBookingId = bookingId;
      const chargeAmount = confirmJson.payAmountZar ?? payTotal;
      const requiresPayment = confirmJson.requiresPayment !== false && chargeAmount > 0;

      // Confirmation already returned the server-authoritative amount and pricing.
      // Seed recovery state now so setting pendingBookingId does not immediately
      // issue a redundant payment-summary query before Paystack initialization.
      setPendingSummary({
        bookingId,
        status: "pending_payment",
        paymentStatus: "pending",
        paid: false,
        serviceLabel: config.label,
        address: [values.address, values.suburb].filter(Boolean).join(", "),
        amountZar: chargeAmount,
        pricingSummary: confirmJson.pricingSummary ?? null,
      });

      // Replace the complete client quote with the server-authoritative breakdown,
      // including room factors and any checkout discounts—not only its final total.
      if (confirmJson.pricingSummary) {
        setValue("pricingSummary", confirmJson.pricingSummary, {
          shouldDirty: false,
          shouldValidate: false,
        });
      } else if (
        Number.isFinite(chargeAmount) &&
        Math.abs(chargeAmount - payTotal) >= 1 &&
        values.pricingSummary
      ) {
        setValue(
          "pricingSummary",
          {
            ...values.pricingSummary,
            estimated_total: chargeAmount,
            total: chargeAmount,
          },
          { shouldDirty: false, shouldValidate: false },
        );
      }

      if (!requiresPayment) {
        setConfirming(false);
        clearBookingV2DraftStorage();
        try {
          clearBooking();
        } catch {
          // non-fatal
        }
        // Land on success with bookingId — emit booking_submitted only after authoritative settle check.
        // Do not emit here before navigation (SHL-BK-000097 abort risk).
        window.location.assign(bookingV2CoveredSuccessHref(bookingId));
        return;
      }

      // Confirmation deliberately returns as soon as the canonical booking is persisted.
      // Paystack initialization is a separate, idempotent phase with its own deadline.
      const sessRes = await fetchPaymentPreparation(`/api/bookings/${encodeURIComponent(bookingId)}/payment-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reference: paystackReference,
          paymentPreparationToken: confirmJson.paymentPreparationToken,
        }),
      }, PAYMENT_RECOVERY_TIMEOUT_MS);
      const sessJson = (await sessRes.json()) as {
        status?: string;
        authorizationUrl?: string;
        reference?: string;
        error?: string;
        message?: string;
      };

      if (sessRes.status === 401) {
        onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
        setConfirming(false);
        return;
      }

      if (sessJson.status === "paid") {
        clearBookingV2DraftStorage();
        window.location.assign(
          bookingV2SuccessHref((sessJson.reference ?? paystackReference) || bookingId, bookingId),
        );
        return;
      }

      if (sessJson.status === "ready" && sessJson.authorizationUrl?.trim()) {
        if (sessJson.message) setError(sessJson.message);
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED, {
          service: serviceSlug,
          service_type: serviceSlug,
          serviceAreaName: values.suburb ?? null,
          finalPrice: values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? null,
          extras: values.selectedExtras ?? null,
        }, {
          service_type: serviceSlug,
          suburb: values.suburb ?? null,
          estimated_price: values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? null,
          booking_id: bookingId,
        });
        window.location.assign(sessJson.authorizationUrl.trim());
        return;
      }

      setError(
        sessJson.error?.trim() ||
          sessJson.message?.trim() ||
          "We could not start the secure payment checkout. Your booking is saved — please try again.",
      );
      setConfirming(false);
      return;
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError" &&
        confirmedBookingId &&
        paymentAccessToken
      ) {
        try {
          // The server keeps safely completing Paystack initialization after a
          // browser abort. Re-enter through the idempotent owner recovery path:
          // it reuses the stored link (or the same in-flight promise) and never
          // inserts another booking or creates a duplicate payable amount.
          const recoveryRes = await fetchPaymentPreparation(
            `/api/bookings/${encodeURIComponent(confirmedBookingId)}/payment-session`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${paymentAccessToken}`,
              },
              body: JSON.stringify({}),
            },
            PAYMENT_RECOVERY_TIMEOUT_MS,
          );
          const recoveryJson = (await recoveryRes.json()) as {
            status?: string;
            authorizationUrl?: string;
            reference?: string;
            error?: string;
            message?: string;
          };
          if (recoveryRes.status === 401) {
            onSessionLost("Your sign-in session expired. Please sign in again to complete payment.");
            setConfirming(false);
            return;
          }
          if (recoveryJson.status === "paid") {
            clearBookingV2DraftStorage();
            window.location.assign(
              bookingV2SuccessHref(
                recoveryJson.reference?.trim() || confirmedBookingId,
                confirmedBookingId,
              ),
            );
            return;
          }
          if (recoveryJson.status === "ready" && recoveryJson.authorizationUrl?.trim()) {
            window.location.assign(recoveryJson.authorizationUrl.trim());
            return;
          }
          setError(
            recoveryJson.error?.trim() ||
              recoveryJson.message?.trim() ||
              "We could not open secure payment. Your booking is saved — please try again.",
          );
          setConfirming(false);
          return;
        } catch {
          // Fall through to the bounded retry message below. The saved booking
          // remains the sole source for the next manual retry.
        }
      }
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? confirmedBookingId
            ? "Secure payment preparation took too long. Your booking is saved — please try again."
            : "Booking confirmation took too long. No payment was taken — please try again."
          : confirmedBookingId
            ? "We could not open secure payment. Your booking is saved — please try again."
            : "An unexpected error occurred. Please try again.";
      setError(message);
      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
        flow: "booking_v2",
        action: "paystack_launch",
        message: err instanceof Error ? err.message : message,
      });
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">Confirm &amp; pay</h2>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{user.email}</span>
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center gap-3 pb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
            <config.icon className="h-4.5 w-4.5 text-blue-600" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{pendingSummary?.serviceLabel || config.label}</p>
            <p className="text-xs text-slate-500">{pendingSummary?.address || `${values.address}, ${values.suburb}`}</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-slate-200 pt-3">
          {pendingSummaryLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-slate-600" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading your saved booking total…
            </div>
          ) : displayedPricing ? (
            <CustomerPriceBreakdown pricing={displayedPricing} compact />
          ) : null}
          {!pendingBookingId ? <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Promo code"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm uppercase tracking-wide"
            />
            <button
              type="button"
              onClick={() => void applyPromoCode()}
              disabled={promoChecking || !promoCode.trim()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {promoChecking ? "Checking…" : "Apply"}
            </button>
          </div> : null}
          {!pendingBookingId && promoError ? (
            <p className="text-xs text-amber-700">{promoError}</p>
          ) : null}
          {!pendingBookingId && promoDiscountZar > 0 ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">{promoLabel ?? "Promotion applied"}</p>
              <p className="mt-1 text-emerald-800">
                You save R {promoDiscountZar.toLocaleString("en-ZA")}
              </p>
            </div>
          ) : null}
          {!pendingBookingId && !referralLoading && referralDiscount ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Referral discount applied</p>
              <p className="mt-1 text-emerald-800">
                R {referralDiscount.discountZar.toLocaleString("en-ZA")} off your first booking — no code needed.
              </p>
            </div>
          ) : null}
          {!pendingBookingId && !referralLoading && !referralDiscount && invalidMessage ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Referral discount not applied</p>
              <p className="mt-1 text-amber-800">{invalidMessage}</p>
            </div>
          ) : null}
          {!pendingBookingId && promoDiscountZar > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Promotion discount</span>
              <span>- R {promoDiscountZar.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          {!pendingBookingId && referralToApply > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Referral discount</span>
              <span>- R {referralToApply.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          {!pendingBookingId && creditBalance > 0 ? (
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Apply Cleaning Credit</p>
                <p className="text-xs text-emerald-700">R {creditBalance.toLocaleString("en-ZA")} available</p>
              </div>
              <input
                type="checkbox"
                checked={applyCredit}
                onChange={(e) => setApplyCredit(e.target.checked)}
                className="h-5 w-5 rounded border-emerald-300 text-emerald-600"
              />
            </label>
          ) : null}
          {!pendingBookingId && creditToApply > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Cleaning Credit</span>
              <span>- R {creditToApply.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-base font-bold">
            <span className="text-slate-800">
              {values.bookingType === "recurring" ? "Pay first 30 days" : "Total to pay"}
            </span>
            <span className="text-blue-700">
              {displayedTotal === null ? "—" : `R ${displayedTotal.toLocaleString("en-ZA")}`}
            </span>
          </div>
          {!pendingBookingId && recurringPrepayment ? (
            <p className="text-xs text-slate-500">
              Covers {recurringPrepayment.visitCount} visit{recurringPrepayment.visitCount === 1 ? "" : "s"} from{" "}
              {recurringPrepayment.coverageStartDate} to {recurringPrepayment.coverageEndDate}. The next 30-day package renews automatically while your recurring booking remains active.
            </p>
          ) : null}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}
      {!error && pendingSummaryError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {pendingSummaryError}
        </div>
      ) : null}
      {!error && !pendingBookingId && !quoteReadiness.ready ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {quoteReadiness.message}
        </div>
      ) : null}

      {/* Pay button */}
      <button
        type="button"
        onClick={handleConfirmAndPay}
        disabled={confirming || !canStartPayment}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
      >
        {confirming ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            {pendingBookingId ? "Reopening secure payment…" : "Preparing secure payment…"}
          </>
        ) : (
          <>
            <Lock className="h-5 w-5" aria-hidden />
            {pendingBookingId
              ? "Retry secure payment"
              : `Pay R${payTotal.toLocaleString("en-ZA")} securely`}
          </>
        )}
      </button>

      {/* Trust badges */}
      <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4">
        {[
          { Icon: ShieldCheck, label: "Vetted cleaners" },
          { Icon: CreditCard, label: "Secure payment" },
          { Icon: CheckCircle2, label: "Satisfaction guaranteed" },
        ].map(({ Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-1 text-center text-xs text-slate-500 sm:flex-row sm:justify-center sm:text-left">
            <Icon className="h-4 w-4 shrink-0 text-green-500" aria-hidden />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        By paying, you agree to our{" "}
        <Link href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</Link>
        {" "}and{" "}
        <Link href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</Link>
        {values.bookingType === "recurring"
          ? ", and authorise Shalean to charge each complete 30-day visit package automatically until you pause, cancel, or change the recurring booking."
          : "."}
      </p>
    </div>
  );
}

// ??? Step 4 ?????????????????????????????????????????????????????????????????????

export function Step4Payment() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    getUser().then((u) => {
      setUser(u);
      setCheckingAuth(false);
    });
  }, []);

  const handleSessionLost = useCallback((message: string) => {
    setAuthNotice(message);
    setUser(null);
  }, []);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {authNotice && !user ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {authNotice}
        </div>
      ) : null}

      {!user ? (
        <AuthGate
          onAuthenticated={(u) => {
            setAuthNotice(null);
            setUser(u);
          }}
        />
      ) : (
        <PaymentSection
          user={user}
          onSessionLost={handleSessionLost}
        />
      )}
    </div>
  );
}
