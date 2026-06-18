"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

// ─── Auth Form ─────────────────────────────────────────────────────────────────

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
          Your booking details are saved — signing in will not clear them.
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
              <a
                href="/auth/forgot-password"
                className="text-xs font-medium text-blue-600 hover:underline"
                tabIndex={-1}
              >
                Forgot password?
              </a>
            </div>
            <PasswordInput
              id="si-password"
              autoComplete="current-password"
              placeholder="••••••••"
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

// ─── Payment section ────────────────────────────────────────────────────────────

function PaymentSection({ user }: { user: User }) {
  const router = useRouter();
  const { serviceSlug, clearBooking } = useBookingV2();
  const { watch } = useFormContext<BookingV2FormData>();
  const values = watch();
  const config = SERVICE_CONFIG[serviceSlug];

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify(values),
      });

      const confirmJson = (await confirmRes.json()) as {
        success?: boolean;
        bookingId?: string;
        paystackReference?: string;
        error?: string;
      };

      if (!confirmRes.ok || !confirmJson.success || !confirmJson.bookingId) {
        setError(confirmJson.error ?? "Could not create your booking. Please try again.");
        setConfirming(false);
        return;
      }

      // 2. Launch Paystack inline checkout
      const { paystackReference, bookingId } = confirmJson;

      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      popup.newTransaction({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
        email: user.email ?? "",
        amount:
          (values.pricingSummary?.estimated_total ??
            values.pricingSummary?.total ??
            config.basePrice) * 100, // in kobo/cents
        currency: "ZAR",
        reference: paystackReference,
        onSuccess: () => {
          clearBooking();
          router.push(`/account/success?reference=${encodeURIComponent(paystackReference ?? bookingId ?? "")}`);
        },
        onCancel: () => {
          setError("Payment cancelled. Your booking is saved — you can retry payment.");
          setConfirming(false);
        },
      });
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
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
          <div className="flex items-center justify-between text-base font-bold">
            <span className="text-slate-800">Total to pay</span>
            <span className="text-blue-700">
              R{(values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? config.basePrice).toLocaleString("en-ZA")}
            </span>
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
            Processing…
          </>
        ) : (
          <>
            <Lock className="h-5 w-5" aria-hidden />
            Pay R{(values.pricingSummary?.estimated_total ?? values.pricingSummary?.total ?? config.basePrice).toLocaleString("en-ZA")} securely
          </>
        )}
      </button>

      {/* Trust badges */}
      <div className="flex flex-col gap-2">
        {[
          { Icon: ShieldCheck, label: "Vetted and background-checked cleaners" },
          { Icon: CreditCard, label: "Secure payment powered by Paystack" },
          { Icon: CheckCircle2, label: "100% satisfaction guarantee — we'll make it right" },
        ].map(({ Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-slate-500">
            <Icon className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden />
            {label}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        By paying, you agree to our{" "}
        <a href="/terms-of-service" className="underline hover:text-slate-600">Terms of Service</a>
        {" "}and{" "}
        <a href="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</a>.
      </p>
    </div>
  );
}

// ─── Step 4 ─────────────────────────────────────────────────────────────────────

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
