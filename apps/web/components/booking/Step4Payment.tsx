"use client";

import { ChevronDown } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { computeCheckoutTotalZar, MAX_TIP_ZAR } from "@/lib/booking/checkoutTotal";
import { readGuestUserFromStorage, writeGuestUserToStorage } from "@/lib/booking/guestUserStorage";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import { resolveExtrasLineItems } from "@/lib/booking/extrasSnapshot";
import { formatLockedAppointmentLabel, type LockedBooking } from "@/lib/booking/lockedBooking";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import { computeBundledExtrasTotalZarSnapshot, computeExtrasBundleSavingsZar } from "@/lib/pricing/extrasConfig";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getStoredReferral } from "@/lib/referrals/client";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { useAuth } from "@/lib/auth/useAuth";
import { getBookingSummaryServiceLabel } from "./serviceCategories";
import { normalizeVipTier, vipTierDisplayName } from "@/lib/pricing/vipTier";

export type AuthMode = "guest" | "login" | "register";

export type Step4Totals = {
  totalZar: number;
  tipZar: number;
  discountZar: number;
  /** Non-empty when a promo is applied — sent to Paystack initialize. */
  promoCode: string | null;
  email: string;
  emailValid: boolean;
  authMode: AuthMode;
  name: string;
  phone: string;
  contactReady: boolean;
  authenticated: boolean;
  userId: string | null;
  accessToken: string | null;
  referralCode: string | null;
  subscriptionFrequency: "weekly" | "biweekly" | "monthly" | null;
};

const TIP_PRESETS = [20, 50, 100] as const;

function formatZar(n: number): string {
  return n.toLocaleString("en-ZA");
}

function contactFieldsValid(name: string, email: string, phone: string): boolean {
  return (
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    phone.trim().length >= 5
  );
}

type Step4PaymentProps = {
  locked: LockedBooking;
  cleanerName: string | null;
  /** When `register=1` in URL — open Create account tab (e.g. after guest checkout). */
  preferRegisterTab?: boolean;
  authOverride?: {
    id: string;
    accessToken: string;
    email?: string;
    name?: string;
    phone?: string;
  } | null;
  onTotalsChange: (totals: Step4Totals) => void;
};

export function Step4Payment({
  locked,
  cleanerName,
  preferRegisterTab,
  authOverride,
  onTotalsChange,
}: Step4PaymentProps) {
  const { catalog, canonicalTotalZar } = useBookingPrice();
  const [tip, setTip] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customTipDraft, setCustomTipDraft] = useState("");

  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountZar: number;
    description: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [referralDiscount, setReferralDiscount] = useState<{
    code: string;
    discountZar: number;
  } | null>(null);

  const recurringDiscount = useMemo(() => {
    const f = locked.cleaningFrequency ?? "one_time";
    if (f === "weekly") return { label: "Weekly plan discount", amount: Math.round(locked.finalPrice * 0.1), frequency: f };
    if (f === "biweekly") return { label: "Bi-weekly plan discount", amount: Math.round(locked.finalPrice * 0.05), frequency: f };
    return null;
  }, [locked.cleaningFrequency, locked.finalPrice]);

  const [authMode, setAuthMode] = useState<AuthMode>(preferRegisterTab ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [sessionUser, setSessionUser] = useState<{ id: string; accessToken: string } | null>(null);
  const [editingLoggedInDetails, setEditingLoggedInDetails] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!authOverride) return;
    setSessionUser({ id: authOverride.id, accessToken: authOverride.accessToken });
    if (authOverride.email?.trim()) setEmail(authOverride.email.trim());
    if (authOverride.name?.trim()) setName(authOverride.name.trim());
    if (authOverride.phone?.trim()) setPhone(authOverride.phone.trim());
  }, [authOverride]);

  useEffect(() => {
    if (!preferRegisterTab) return;
    startTransition(() => setAuthMode("register"));
  }, [preferRegisterTab]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const guest = readGuestUserFromStorage();

    async function hydrate() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const sess = data.session;
        if (sess?.user) {
          void linkBookingsToUserAfterAuth(sess.access_token, sess.user);
          startTransition(() => {
            setAuthMode("login");
            setSessionUser({ id: sess.user.id, accessToken: sess.access_token });
            const em = sess.user.email?.trim() ?? "";
            if (em) setEmail(em);
            const meta = sess.user.user_metadata as Record<string, unknown> | undefined;
            const full =
              (typeof meta?.full_name === "string" && meta.full_name) ||
              (typeof meta?.name === "string" && meta.name) ||
              "";
            if (typeof full === "string" && full.trim()) setName(full.trim());
            const ph = typeof meta?.phone === "string" ? meta.phone.trim() : "";
            if (ph) setPhone(ph);
          });
          return;
        }
      }
      if (guest) {
        startTransition(() => {
          setName(guest.name);
          setEmail(guest.email);
          setPhone(guest.phone);
        });
      }
    }

    void hydrate();

    if (!supabase) return;

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "SIGNED_IN" && sess?.user) {
        void linkBookingsToUserAfterAuth(sess.access_token, sess.user);
        setAuthMode("login");
        setSessionUser({ id: sess.user.id, accessToken: sess.access_token });
        const em = sess.user.email?.trim() ?? "";
        if (em) setEmail(em);
        setAuthError(null);
      }
      if (event === "SIGNED_OUT") {
        setSessionUser(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("customer_name, customer_email, customer_phone, created_at")
        .eq("user_id", user.id)
        .neq("status", "pending_payment")
        .neq("status", "payment_expired")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active || !data) return;
      if (typeof data.customer_name === "string" && data.customer_name.trim()) setName(data.customer_name.trim());
      if (typeof data.customer_email === "string" && data.customer_email.trim()) setEmail(data.customer_email.trim());
      if (typeof data.customer_phone === "string" && data.customer_phone.trim()) setPhone(data.customer_phone.trim());
    })();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const code = getStoredReferral("customer");
    if (!code) return;
    setReferralDiscount({ code, discountZar: 50 });
  }, []);

  const discountZar = (promoApplied?.discountZar ?? 0) + (referralDiscount?.discountZar ?? 0) + (recurringDiscount?.amount ?? 0);

  const totalZar = useMemo(
    () => computeCheckoutTotalZar(locked.finalPrice, tip, discountZar),
    [locked.finalPrice, tip, discountZar],
  );

  const checkoutDiscountLines = useMemo(() => {
    const lines: { key: string; label: string; amount: number }[] = [];
    if (promoApplied && promoApplied.discountZar > 0) {
      lines.push({
        key: "promo",
        label: promoApplied.description.trim() || `Promo (${promoApplied.code})`,
        amount: promoApplied.discountZar,
      });
    }
    if (referralDiscount && referralDiscount.discountZar > 0) {
      lines.push({
        key: "referral",
        label: "Referral discount",
        amount: referralDiscount.discountZar,
      });
    }
    if (recurringDiscount && recurringDiscount.amount > 0) {
      lines.push({
        key: "plan",
        label: recurringDiscount.label,
        amount: recurringDiscount.amount,
      });
    }
    return lines;
  }, [promoApplied, referralDiscount, recurringDiscount]);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const contactReady = useMemo(
    () => contactFieldsValid(name, email, phone),
    [name, email, phone],
  );

  const payReadyForMode = useMemo(() => {
    return Boolean(contactReady && sessionUser?.accessToken && sessionUser.id);
  }, [authMode, contactReady, sessionUser]);

  useEffect(() => {
    const userId = sessionUser?.id ?? null;
    const accessToken = sessionUser?.accessToken ?? null;

    onTotalsChange({
      totalZar,
      tipZar: tip,
      discountZar,
      promoCode: promoApplied?.code ?? null,
      email: email.trim(),
      emailValid,
      authMode: sessionUser ? "login" : "guest",
      name: name.trim(),
      phone: phone.trim(),
      contactReady,
      authenticated: Boolean(sessionUser?.accessToken && sessionUser.id),
      userId,
      accessToken,
      referralCode: referralDiscount?.code ?? null,
      subscriptionFrequency:
        locked.cleaningFrequency === "weekly" ||
        locked.cleaningFrequency === "biweekly" ||
        locked.cleaningFrequency === "monthly"
          ? locked.cleaningFrequency
          : null,
    });
  }, [
    totalZar,
    tip,
    discountZar,
    promoApplied,
    email,
    emailValid,
    name,
    phone,
    contactReady,
    sessionUser,
    onTotalsChange,
    referralDiscount?.code,
    locked.cleaningFrequency,
    recurringDiscount?.amount,
  ]);

  function persistGuest() {
    if (contactFieldsValid(name, email, phone)) {
      writeGuestUserToStorage({ name: name.trim(), email: email.trim(), phone: phone.trim() });
    }
    if (emailValid) writeUserEmailToStorage(email.trim());
  }

  function selectAuthMode(mode: AuthMode) {
    setAuthError(null);
    setAuthInfo(null);
    if (mode === "guest") {
      setSessionUser(null);
    }
    if (mode === "login") {
      void (async () => {
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setSessionUser({ id: data.session.user.id, accessToken: data.session.access_token });
        }
      })();
    }
    setAuthMode(mode);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthError("Sign-in is not available. Continue as guest or check configuration.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: loginPassword,
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.session?.user) {
      void linkBookingsToUserAfterAuth(data.session.access_token, data.session.user);
      setSessionUser({ id: data.session.user.id, accessToken: data.session.access_token });
      setAuthMode("login");
      const meta = data.session.user.user_metadata as Record<string, unknown> | undefined;
      const full =
        (typeof meta?.full_name === "string" && meta.full_name) ||
        (typeof meta?.name === "string" && meta.name) ||
        "";
      if (typeof full === "string" && full.trim()) setName(full.trim());
      const ph = typeof meta?.phone === "string" ? meta.phone.trim() : "";
      if (ph) setPhone(ph);
      setLoginPassword("");
      setAuthInfo("Signed in. Your details are filled below.");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthError("Account creation is not available. Continue as guest or check configuration.");
      return;
    }
    if (registerPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: registerPassword,
      options: {
        data: {
          full_name: name.trim(),
          phone: phone.trim(),
        },
      },
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.session?.user) {
      void linkBookingsToUserAfterAuth(data.session.access_token, data.session.user);
      setSessionUser({ id: data.session.user.id, accessToken: data.session.access_token });
      setRegisterPassword("");
      setAuthInfo("Account created. You can pay below.");
      return;
    }
    setAuthInfo(
      "Check your email to confirm your account, then return here to sign in — or continue as guest.",
    );
  }

  async function handleForgotPassword() {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAuthError("Password reset is not available.");
      return;
    }
    if (!emailValid) {
      setAuthError("Enter your email first.");
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const redirectTo = origin ? `${origin}${bookingFlowHref("checkout")}` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthInfo("If an account exists for this email, you will receive a reset link.");
  }

  function applyPromo() {
    setPromoError(null);
    const code = promoInput.trim();
    if (!code) {
      setPromoError("Enter a code or leave blank.");
      return;
    }
    const result = getPromoDiscountZar(code, locked.finalPrice);
    if (!result) {
      setPromoApplied(null);
      setPromoError("That code isn’t valid for this booking.");
      return;
    }
    setPromoApplied({
      code: code.toUpperCase(),
      discountZar: result.discountZar,
      description: result.description,
    });
  }

  function clearPromo() {
    setPromoApplied(null);
    setPromoError(null);
    setPromoInput("");
  }

  function selectPreset(amount: number) {
    setCustomMode(false);
    setCustomTipDraft("");
    setTip(amount);
  }

  function startCustom() {
    setCustomMode(true);
    setCustomTipDraft(tip > 0 ? String(tip) : "");
  }

  function commitCustomTip() {
    const n = Math.round(Number.parseFloat(customTipDraft) || 0);
    const clamped = Math.min(MAX_TIP_ZAR, Math.max(0, n));
    setTip(clamped);
    setCustomTipDraft(String(clamped));
  }

  const serviceName =
    locked.service === null
      ? "Not selected"
      : getBookingSummaryServiceLabel(locked.service, locked.service_type);

  const extrasLineItems = useMemo(
    () => resolveExtrasLineItems({ extras: locked.extras, extras_line_items: locked.extras_line_items, service: locked.service }),
    [locked.extras, locked.extras_line_items, locked.service],
  );

  const extrasBundledZar = useMemo(() => {
    if (!catalog) return 0;
    return computeBundledExtrasTotalZarSnapshot(catalog, locked.extras, locked.service);
  }, [catalog, locked.extras, locked.service]);

  const extrasBundleSavingsZar = useMemo(
    () => (catalog ? computeExtrasBundleSavingsZar(catalog, locked.extras, locked.service) : 0),
    [catalog, locked.extras, locked.service],
  );

  const checkoutMicro = bookingCopy.checkout;
  const visitTotalZar = locked.finalPrice;
  const extrasTotalZar = Math.max(0, extrasBundledZar);
  const serviceSubtotalZar = Math.max(0, visitTotalZar - extrasTotalZar);
  const anchorPrice = canonicalTotalZar != null && Number.isFinite(canonicalTotalZar) && canonicalTotalZar > 0
    ? canonicalTotalZar
    : null;
  const pricingDeltaZar = anchorPrice != null ? Math.round(anchorPrice - visitTotalZar) : null;
  const pricingDeltaPercent =
    anchorPrice != null ? Math.round(((anchorPrice - visitTotalZar) / anchorPrice) * 100) : null;

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const inputClass =
    "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-1 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-primary";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70 sm:p-6">
      <section className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-700">
        <h2 className="sr-only">Booking summary</h2>
        <dl className="space-y-2.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{checkoutMicro.summaryWhat}</dt>
            <dd className="min-w-0 font-semibold text-zinc-900 dark:text-zinc-50">{serviceName}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{checkoutMicro.summaryWhere}</dt>
            <dd className="min-w-0 text-zinc-800 dark:text-zinc-100">{locked.location || "Address on file"}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{checkoutMicro.summaryWhen}</dt>
            <dd className="min-w-0 text-zinc-800 dark:text-zinc-100">{formatLockedAppointmentLabel(locked)}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">Bedrooms</dt>
            <dd className="min-w-0 tabular-nums text-zinc-800 dark:text-zinc-100">{locked.rooms}</dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">Bathrooms</dt>
            <dd className="min-w-0 tabular-nums text-zinc-800 dark:text-zinc-100">{locked.bathrooms}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-1 border-t border-zinc-200/80 pt-3 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {checkoutMicro.trustShort.map((line) => (
            <li key={line} className="flex gap-2 leading-snug">
              <span className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Price breakdown</h2>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Clear summary of what you are paying for.</p>
        {typeof locked.quoteSubtotalZar === "number" &&
        Number.isFinite(locked.quoteSubtotalZar) &&
        typeof locked.quoteVipSavingsZar === "number" &&
        Number.isFinite(locked.quoteVipSavingsZar) &&
        locked.quoteVipSavingsZar > 0 ? (
          <>
            <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
              <span>Service</span>
              <span className="tabular-nums">R {formatZar(locked.quoteSubtotalZar)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm text-emerald-800 dark:text-emerald-300">
              <span>VIP discount ({vipTierDisplayName(normalizeVipTier(locked.vipTier))})</span>
              <span className="tabular-nums">−R {formatZar(locked.quoteVipSavingsZar)}</span>
            </div>
            {typeof locked.quoteAfterVipSubtotalZar === "number" &&
            Number.isFinite(locked.quoteAfterVipSubtotalZar) ? (
              <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                After loyalty: R {formatZar(locked.quoteAfterVipSubtotalZar)}
              </p>
            ) : null}
          </>
        ) : null}
        <div className="mt-3 space-y-1 rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
            <span>
              Service ({locked.rooms} bed, {locked.bathrooms} bath)
            </span>
            <span className="tabular-nums">R {formatZar(serviceSubtotalZar)}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
            <span>Extras</span>
            <span className="tabular-nums">R {formatZar(extrasTotalZar)}</span>
          </div>
          {pricingDeltaZar != null && pricingDeltaZar > 0 ? (
            <div className="flex items-center justify-between text-green-600 dark:text-green-400">
              <span>Savings (better time)</span>
              <span className="tabular-nums">-R {formatZar(Math.abs(pricingDeltaZar))}</span>
            </div>
          ) : null}
          {pricingDeltaZar != null && pricingDeltaZar < 0 ? (
            <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
              <span>High demand</span>
              <span className="tabular-nums">+R {formatZar(Math.abs(pricingDeltaZar))}</span>
            </div>
          ) : null}
          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-700">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-zinc-900 dark:text-zinc-50">Visit total</span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-50">R {formatZar(visitTotalZar)}</span>
            </div>
          </div>
        </div>
        {extrasLineItems.length > 0 ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Extras</p>
            <ul className="space-y-1">
              {extrasLineItems.map((row) => (
                <li key={row.slug} className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="min-w-0 pr-2">{row.name}</span>
                  <span className="shrink-0 tabular-nums">R {formatZar(row.price)}</span>
                </li>
              ))}
            </ul>
            {extrasBundleSavingsZar > 0 ? (
              <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                Bundle savings (R {formatZar(extrasBundleSavingsZar)}) are included in your locked visit total below.
              </p>
            ) : null}
          </div>
        ) : null}
        {tip > 0 ? (
          <div className="mt-1 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>Tip</span>
            <span className="tabular-nums">R {formatZar(tip)}</span>
          </div>
        ) : null}
        {checkoutDiscountLines.map((row) => (
          <div key={row.key} className="mt-1 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
            <span>{row.label}</span>
            <span className="tabular-nums text-emerald-700 dark:text-emerald-400">-R {formatZar(row.amount)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between text-lg font-semibold">
          <span className="text-zinc-900 dark:text-zinc-50">
            {checkoutDiscountLines.length > 0 || tip > 0 ? "Final total" : "Total"}
          </span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">R {formatZar(totalZar)}</span>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Includes all selected extras • Price locked for your selected time
        </p>
        {pricingDeltaZar != null && pricingDeltaPercent != null && pricingDeltaZar > 0 ? (
          <p className="text-xs text-green-600 dark:text-green-400">
            ✔ You saved R{formatZar(Math.abs(pricingDeltaZar))} ({Math.abs(pricingDeltaPercent)}%) by choosing this time
          </p>
        ) : null}
        {pricingDeltaZar != null && pricingDeltaZar < 0 ? (
          <p className="text-xs text-orange-600 dark:text-orange-400">
            ⚡ Higher price due to demand at this time
          </p>
        ) : null}
        {pricingDeltaZar === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Standard pricing applied</p>
        ) : null}
        {anchorPrice != null ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Compared to standard time price</p>
        ) : null}
        <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-snug text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
          {checkoutMicro.extrasGuarantee}
        </p>
      </section>

      <section
        aria-labelledby="optional-heading"
        className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-950/60"
      >
        <button
          type="button"
          id="optional-heading"
          onClick={() => setPromoOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-900 dark:text-zinc-50"
          aria-expanded={promoOpen}
        >
          <span>Add promo or tip (optional)</span>
          <ChevronDown
            className={[
              "h-4 w-4 shrink-0 text-zinc-500 transition-transform",
              promoOpen ? "rotate-180" : "",
            ].join(" ")}
            aria-hidden
          />
        </button>
        {promoOpen ? (
          <div className="space-y-4 border-t border-zinc-200/80 px-4 pb-4 pt-3 dark:border-zinc-800">
            <div className="space-y-2">
              {recurringDiscount ? (
                <div className="rounded-lg border border-blue-200/80 bg-blue-50/90 px-3 py-2 text-xs text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-100">
                  {recurringDiscount.label} applied.
                </div>
              ) : null}
              {referralDiscount ? (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Code: {referralDiscount.code} · −R {formatZar(referralDiscount.discountZar)}
                </div>
              ) : null}
              {promoApplied ? (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                  <p className="font-medium">{promoApplied.code} applied</p>
                  <button
                    type="button"
                    onClick={clearPromo}
                    className="mt-1 text-[11px] font-semibold underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={(e) => {
                        setPromoInput(e.target.value);
                        setPromoError(null);
                      }}
                      placeholder="Promo code"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-primary focus:ring-1 dark:border-zinc-700 dark:bg-zinc-950"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      className="h-9 shrink-0 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950"
                    >
                      Apply
                    </button>
                  </div>
                  {promoError ? (
                    <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                      {promoError}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {TIP_PRESETS.map((amount) => {
                  const active = !customMode && tip === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => selectPreset(amount)}
                      className={[
                        "rounded-full border px-3 py-1 text-sm transition",
                        active
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100"
                          : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
                      ].join(" ")}
                    >
                      R{amount}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={startCustom}
                  className={[
                    "rounded-full border px-3 py-1 text-sm transition",
                    customMode
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950",
                  ].join(" ")}
                >
                  Custom
                </button>
              </div>
              {customMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 items-center overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                    <span className="pl-2 text-xs text-zinc-500">R</span>
                    <input
                      type="number"
                      min={0}
                      max={MAX_TIP_ZAR}
                      step={1}
                      value={customTipDraft}
                      onChange={(e) => setCustomTipDraft(e.target.value)}
                      onBlur={commitCustomTip}
                      className="h-full w-20 bg-transparent px-1 text-sm outline-none dark:text-zinc-100"
                      aria-label="Custom tip amount"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={commitCustomTip}
                    className="h-9 rounded-lg bg-zinc-100 px-3 text-xs font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    Set
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="contact-heading"
        className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60"
      >
        <h2 id="contact-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Contact details</h2>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {sessionUser
            ? "Signed in. Confirm your details before payment."
            : "You’ll be asked to login or sign up after tapping Confirm."}
        </p>
        <div className="mt-3 space-y-3">
          <input
            type="text"
            required
            autoComplete="name"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={persistGuest}
            className={inputClass}
          />
          <input
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={persistGuest}
            className={inputClass}
          />
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={persistGuest}
            className={inputClass}
          />
        </div>
        {!supabaseConfigured ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400/90">Sign-in is currently unavailable.</p>
        ) : null}
      </section>

      {cleanerName ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Cleaner: {cleanerName}</p>
      ) : null}
    </div>
  );
}
