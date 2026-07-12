"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, ShieldCheck, CreditCard, Lock, Mail, Phone, User as UserIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, signUp, getUser, getSession } from "@/lib/auth/authClient";
import { signInSchema, signUpSchema, type SignInData, type SignUpData } from "@/src/features/booking-v2/schemas";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { useFormContext } from "react-hook-form";
import { CustomerPriceBreakdown } from "@/src/features/booking-v2/components/CustomerPriceBreakdown";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import type { User } from "@supabase/supabase-js";
import {
  ANALYTICS_EVENTS,
  BOOKING_FUNNEL_ROW,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { useStoredReferralCheckoutDiscount } from "@/hooks/useStoredReferralCheckoutDiscount";
import { getStoredReferral } from "@/lib/referrals/client";

// ??? Auth Form ?????????????????????????????????????????????????????????????????

type AuthMode = "sign_in" | "sign_up";

function AuthGate({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signInForm = useForm<SignInData>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpData>({ resolver: zodResolver(signUpSchema) });

  async function handleSignIn(data: SignInData) {
    setLoading(true);
    setServerError(null);
    const { user, error } = await signIn(data.email, data.password);
    setLoading(false);
    if (error || !user) {
      setServerError(error?.message ?? "Sign in failed. Check your email and password.");
      return;
    }
    onAuthenticated(user);
  }

  async function handleSignUp(data: SignUpData) {
    setLoading(true);
    setServerError(null);
    const { user, error } = await signUp(data.email, data.password, data.fullName, data.phone ?? "");
    setLoading(false);
    if (error || !user) {
      setServerError(error?.message ?? "Sign up failed. Please try again.");
      return;
    }
    onAuthenticated(user);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          {mode === "sign_in" ? "Sign in to confirm your booking" : "Create an account"}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Your booking details are saved ? signing in will not clear them.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-slate-200 p-1">
        {(["sign_in", "sign_up"] as AuthMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setServerError(null); }}
            className={cn(
              "flex-1 rounded-lg py-2 text-sm font-semibold transition",
              mode === m ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-800",
            )}
          >
            {m === "sign_in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {/* Server error */}
      {serverError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {serverError}
        </div>
      )}

      {mode === "sign_in" ? (
        <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-4">
          <div>
            <label htmlFor="si-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="si-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...signInForm.register("email")}
                className="block w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
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
                tabIndex={-1}
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="si-password"
              autoComplete="current-password"
              placeholder="????????"
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
            Sign in
          </button>
        </form>
      ) : (
        <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
          <div>
            <label htmlFor="su-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Full name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="su-name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                {...signUpForm.register("fullName")}
                className="block w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {signUpForm.formState.errors.fullName && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.fullName.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Email address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="su-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...signUpForm.register("email")}
                className="block w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {signUpForm.formState.errors.email && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-phone" className="mb-1.5 block text-sm font-medium text-slate-700">
              Phone number <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="su-phone"
                type="tel"
                autoComplete="tel"
                placeholder="0821234567"
                {...signUpForm.register("phone")}
                className="block w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {signUpForm.formState.errors.phone && (
              <p className="mt-1 text-xs text-red-500">{signUpForm.formState.errors.phone.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="su-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              id="su-password"
              autoComplete="new-password"
              placeholder="Min. 6 characters"
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
            Create account & continue
          </button>
        </form>
      )}
    </div>
  );
}

// ??? Payment section ????????????????????????????????????????????????????????????

function PaymentSection({ user }: { user: User }) {
  const { serviceSlug, clearBooking } = useBookingV2();
  const { watch } = useFormContext<BookingV2FormData>();
  const values = watch();
  const config = SERVICE_CONFIG[serviceSlug];

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredit, setApplyCredit] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscountZar, setPromoDiscountZar] = useState(0);
  const [promoLabel, setPromoLabel] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const baseTotal = values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? config.basePrice;
  const { referralDiscount, loading: referralLoading, invalidMessage } = useStoredReferralCheckoutDiscount({
    email: user.email,
    bookingTotalZar: Math.max(0, baseTotal - promoDiscountZar),
    serviceSlug,
  });

  const referralToApply = referralDiscount?.discountZar ?? 0;
  const totalAfterPromo = Math.max(0, baseTotal - promoDiscountZar);
  const totalAfterReferral = Math.max(0, totalAfterPromo - referralToApply);
  const creditToApply = applyCredit ? Math.min(creditBalance, totalAfterReferral) : 0;
  const payTotal = Math.max(0, totalAfterReferral - creditToApply);

  useEffect(() => {
    void (async () => {
      const session = await getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/referrals/credit", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const j = (await res.json()) as { balance?: number };
        setCreditBalance(Number(j.balance ?? 0));
      }
    })();
  }, []);

  // Auto-apply eligible promotions (first booking, bundles, membership) on load
  useEffect(() => {
    void (async () => {
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
          subtotalZar: baseTotal,
          customerEmail: user.email,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as {
        totalDiscountZar?: number;
        applied?: { name: string; discountZar: number; source: string }[];
        rejected?: { reason: string }[];
      };
      const autoOnly = (j.applied ?? []).filter((a) => a.source !== "code" || !promoCode.trim());
      const total = autoOnly.reduce((sum, a) => sum + Math.round(Number(a.discountZar ?? 0)), 0);
      if (total > 0 && autoOnly.length) {
        setPromoDiscountZar(total);
        setPromoLabel(autoOnly.map((a) => a.name).join(", "));
        setPromoError(null);
      } else if (!promoCode.trim()) {
        setPromoDiscountZar(0);
        setPromoLabel(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when cart basics change
  }, [serviceSlug, baseTotal, values.selectedExtras, user.email]);

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
          subtotalZar: baseTotal,
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

  async function handleConfirmAndPay() {
    setConfirming(true);
    setError(null);

    try {
      // 1. Confirm booking and get bookingId + paystackReference
      const session = await getSession();
      if (!session?.access_token) {
        setError("Session expired. Please refresh the page.");
        setConfirming(false);
        return;
      }

      const confirmRes = await fetch("/api/booking-v2/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...values,
          applyCleaningCreditZar: creditToApply,
          // Omit when unset: Zod optional strings reject JSON null from getStoredReferral.
          referralCode:
            (referralDiscount?.code ?? getStoredReferral("customer") ?? "").trim() || undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      });

      const confirmJson = (await confirmRes.json()) as {
        success?: boolean;
        bookingId?: string;
        paystackReference?: string;
        payAmountZar?: number;
        creditAppliedZar?: number;
        requiresPayment?: boolean;
        error?: string;
      };

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
      const chargeAmount = confirmJson.payAmountZar ?? payTotal;
      const requiresPayment = confirmJson.requiresPayment !== false && chargeAmount > 0;

      if (!requiresPayment) {
        setConfirming(false);
        try {
          clearBooking();
        } catch {
          // non-fatal
        }
        const ref = paystackReference ?? bookingId ?? "";
        window.location.assign(`/account/success?reference=${encodeURIComponent(ref)}`);
        return;
      }

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

      // 2. Launch Paystack inline checkout
      const { getAcquisitionPayloadFields } = await import("@/lib/analytics/acquisitionContext");
      const acq = getAcquisitionPayloadFields();
      const gclid = typeof acq.gclid === "string" ? acq.gclid.trim() : "";
      const fbclid = typeof acq.fbclid === "string" ? acq.fbclid.trim() : "";

      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      const paystackOpts = {
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
        email: user.email ?? "",
        amount: chargeAmount * 100,
        currency: "ZAR" as const,
        reference: paystackReference,
        metadata: {
          booking_id: bookingId,
          pay_total_zar: String(chargeAmount),
          expected_total_zar: String(chargeAmount),
          ...(gclid ? { gclid } : {}),
          ...(fbclid ? { fbclid } : {}),
        },
        onSuccess: () => {
          const ref = paystackReference ?? bookingId ?? "";
          // Clear busy state first so the UI never stays stuck on "Processing?"
          // if navigation is slow or the popup callback is flaky.
          setConfirming(false);
          try {
            clearBooking();
          } catch {
            // non-fatal ? success page does not need local draft state
          }
          // Hard navigation is more reliable from Paystack iframe callbacks than
          // Next soft routing (which can be interrupted when form state resets).
          window.location.assign(
            `/account/success?reference=${encodeURIComponent(ref)}`,
          );
        },
        onCancel: () => {
          setError("Payment cancelled. Your booking is saved ? you can retry payment.");
          trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.EXIT, {
            flow: "booking_v2",
            reason: "paystack_cancelled",
            booking_id: bookingId,
          });
          setConfirming(false);
        },
      };
      // Inline SDK typings omit `metadata`; runtime accepts it (same as `initializePayment`).
      popup.newTransaction(paystackOpts as Parameters<typeof popup.newTransaction>[0]);

      // If the popup never calls back (closed tab / browser quirk), unlock the button.
      window.setTimeout(() => {
        setConfirming((still) => {
          if (still) {
            setError(
              "If you completed payment, check My Bookings or your email. Otherwise tap Pay again.",
            );
          }
          return false;
        });
      }, 5 * 60 * 1000);
    } catch (err) {
      const message = "An unexpected error occurred. Please try again.";
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Confirm & pay</h3>
        <p className="mt-1 text-sm text-slate-500">
          You&apos;re logged in as <span className="font-medium text-slate-700">{user.email}</span>.
          Review the total below and complete payment via Paystack.
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
        <div className="flex items-center gap-3 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
            <config.icon className="h-4.5 w-4.5 text-blue-600" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{config.label}</p>
            <p className="text-xs text-slate-500">{values.address}, {values.suburb}</p>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-3 space-y-3">
          <CustomerPriceBreakdown pricing={values.pricingSummary} compact />
          <div className="flex gap-2">
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
              {promoChecking ? "?" : "Apply"}
            </button>
          </div>
          {promoError ? (
            <p className="text-xs text-amber-700">{promoError}</p>
          ) : null}
          {promoDiscountZar > 0 ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">{promoLabel ?? "Promotion applied"}</p>
              <p className="mt-1 text-emerald-800">
                You save R {promoDiscountZar.toLocaleString("en-ZA")}
              </p>
            </div>
          ) : null}
          {!referralLoading && referralDiscount ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Referral discount applied</p>
              <p className="mt-1 text-emerald-800">
                R {referralDiscount.discountZar.toLocaleString("en-ZA")} off your first booking ? no code needed.
              </p>
            </div>
          ) : null}
          {!referralLoading && !referralDiscount && invalidMessage ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Referral discount not applied</p>
              <p className="mt-1 text-amber-800">{invalidMessage}</p>
            </div>
          ) : null}
          {promoDiscountZar > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Promotion discount</span>
              <span>- R {promoDiscountZar.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          {referralToApply > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Referral discount</span>
              <span>- R {referralToApply.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          {creditBalance > 0 ? (
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
          {creditToApply > 0 ? (
            <div className="flex items-center justify-between text-sm text-emerald-700">
              <span>Cleaning Credit</span>
              <span>- R {creditToApply.toLocaleString("en-ZA")}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-base font-bold">
            <span className="text-slate-800">Total to pay</span>
            <span className="text-blue-700">R {payTotal.toLocaleString("en-ZA")}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* Pay button */}
      <button
        type="button"
        onClick={handleConfirmAndPay}
        disabled={confirming}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
      >
        {confirming ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            Processing?
          </>
        ) : (
          <>
            <Lock className="h-5 w-5" aria-hidden />
            Pay R{payTotal.toLocaleString("en-ZA")} securely
          </>
        )}
      </button>

      {/* Trust badges */}
      <div className="flex flex-col gap-2">
        {[
          { Icon: ShieldCheck, label: "Vetted and background-checked cleaners" },
          { Icon: CreditCard, label: "Secure payment powered by Paystack" },
          { Icon: CheckCircle2, label: "100% satisfaction guarantee ? we'll make it right" },
        ].map(({ Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-500">
            <Icon className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden />
            {label}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        By paying, you agree to our{" "}
        <Link href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</Link>
        {" "}and{" "}
        <Link href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</Link>.
      </p>
    </div>
  );
}

// ??? Step 4 ?????????????????????????????????????????????????????????????????????

export function Step4Payment() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    getUser().then((u) => {
      setUser(u);
      setCheckingAuth(false);
    });
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
      <div>
        <h2 className="text-xl font-bold text-slate-900">Payment</h2>
        <p className="mt-1 text-sm text-slate-500">
          {user ? "Ready to confirm your booking." : "Sign in or create an account to complete your booking."}
        </p>
      </div>

      {!user ? (
        <AuthGate onAuthenticated={(u) => setUser(u)} />
      ) : (
        <PaymentSection user={user} />
      )}
    </div>
  );
}
