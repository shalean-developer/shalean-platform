"use client";

import { ChevronDown } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { computeCheckoutTotalZar, MAX_TIP_ZAR } from "@/lib/booking/checkoutTotal";
import { readGuestUserFromStorage, writeGuestUserToStorage } from "@/lib/booking/guestUserStorage";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import { formatLockedAppointmentLabel, type LockedBooking } from "@/lib/booking/lockedBooking";
import { splitLockedFinalPrice } from "@/lib/pricing/lockedPriceSplit";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getStoredReferral } from "@/lib/referrals/client";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { getBookingSummaryServiceLabel } from "./serviceCategories";

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
  onTotalsChange: (totals: Step4Totals) => void;
};

export function Step4Payment({
  locked,
  cleanerName,
  preferRegisterTab,
  onTotalsChange,
}: Step4PaymentProps) {
  const [tip, setTip] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customTipDraft, setCustomTipDraft] = useState("");

  const [promoOpen, setPromoOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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

  const [authMode, setAuthMode] = useState<AuthMode>("guest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [sessionUser, setSessionUser] = useState<{ id: string; accessToken: string } | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

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

  const { serviceTotal, extrasTotal } = useMemo(() => splitLockedFinalPrice(locked), [locked]);

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
    if (authMode === "guest") return contactReady;
    return Boolean(contactReady && sessionUser?.accessToken && sessionUser.id);
  }, [authMode, contactReady, sessionUser]);

  useEffect(() => {
    const userId = authMode === "guest" ? null : sessionUser?.id ?? null;
    const accessToken = authMode === "guest" ? null : sessionUser?.accessToken ?? null;

    onTotalsChange({
      totalZar,
      tipZar: tip,
      discountZar,
      promoCode: promoApplied?.code ?? null,
      email: email.trim(),
      emailValid,
      authMode,
      name: name.trim(),
      phone: phone.trim(),
      contactReady: payReadyForMode,
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
    authMode,
    name,
    phone,
    payReadyForMode,
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

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const inputClass =
    "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-1 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-primary";

  return (
    <div className="w-full space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Review &amp; checkout
      </h1>

      {/* Compact booking summary — single line, no extras list */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-zinc-700 dark:text-zinc-200">
            Service: {serviceName} · {locked.rooms} rooms · {locked.bathrooms}{" "}
            {locked.bathrooms === 1 ? "bath" : "baths"}
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatLockedAppointmentLabel(locked)}
          </span>
        </div>
        {cleanerName ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Cleaner: {cleanerName}</p>
        ) : null}
      </div>

      {/* Visit price + real checkout discounts only (no demand “savings” — those stay on slot selection). */}
      <div className="mt-1 rounded-xl border border-zinc-200/90 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Payment summary</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600 dark:text-zinc-400">Visit price</dt>
            <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">R {formatZar(locked.finalPrice)}</dd>
          </div>
          {checkoutDiscountLines.map((row) => (
            <div key={row.key} className="flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-400">{row.label}</dt>
              <dd className="tabular-nums font-medium text-emerald-700 dark:text-emerald-400">− R {formatZar(row.amount)}</dd>
            </div>
          ))}
          {tip > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600 dark:text-zinc-400">Tip</dt>
              <dd className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">+ R {formatZar(tip)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="my-3 border-t border-zinc-200 dark:border-zinc-700" aria-hidden />
        <div className="flex items-end justify-between gap-4">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Total to pay</span>
          <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">R {formatZar(totalZar)}</span>
        </div>
        {locked.cleaningFrequency === "weekly" || locked.cleaningFrequency === "biweekly" || locked.cleaningFrequency === "monthly" ? (
          <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Auto-pay enabled for your subscription
          </p>
        ) : null}
      </div>

      {/* Collapsible price breakdown */}
      <div>
        <button
          type="button"
          onClick={() => setBreakdownOpen((o) => !o)}
          className="text-sm font-medium text-primary hover:underline"
          aria-expanded={breakdownOpen}
        >
          {breakdownOpen ? "Hide price breakdown" : "View price breakdown"}
        </button>
        {breakdownOpen ? (
          <ul className="mt-3 space-y-2 rounded-xl border border-zinc-200/90 bg-white p-4 text-sm dark:border-zinc-700 dark:bg-zinc-950/60">
            <li className="pb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Components of your locked visit price (not discounts).
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-zinc-600 dark:text-zinc-400">Service</span>
              <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                R {formatZar(serviceTotal)}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span className="text-zinc-600 dark:text-zinc-400">Extras</span>
              <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                R {formatZar(extrasTotal)}
              </span>
            </li>
            <li className="flex justify-between gap-4 border-t border-zinc-100 pt-2 font-medium dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300">Visit price (locked)</span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">R {formatZar(locked.finalPrice)}</span>
            </li>
          </ul>
        ) : null}
      </div>

      {/* Promo — collapsible, minimal */}
      <section
        aria-labelledby="promo-heading"
        className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-950/60"
      >
        <button
          type="button"
          id="promo-heading"
          onClick={() => setPromoOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-900 dark:text-zinc-50"
          aria-expanded={promoOpen}
        >
          <span>Promo code</span>
          <ChevronDown
            className={[
              "h-4 w-4 shrink-0 text-zinc-500 transition-transform",
              promoOpen ? "rotate-180" : "",
            ].join(" ")}
            aria-hidden
          />
        </button>
        {promoOpen ? (
          <div className="space-y-2 border-t border-zinc-200/80 px-4 pb-4 pt-2 dark:border-zinc-800">
            {recurringDiscount ? (
              <div className="rounded-lg border border-blue-200/80 bg-blue-50/90 px-3 py-2 text-xs text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-100">
                {recurringDiscount.label} applied.
              </div>
            ) : null}
            {referralDiscount ? (
              <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-medium">Referral discount applied 🎉</p>
                <p className="mt-0.5 text-[11px]">Code: {referralDiscount.code} · −R {formatZar(referralDiscount.discountZar)}</p>
              </div>
            ) : null}
            {promoApplied ? (
              <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-medium">{promoApplied.code} applied</p>
                <p className="mt-0.5 text-[11px] opacity-90">{promoApplied.description}</p>
                <button
                  type="button"
                  onClick={clearPromo}
                  className="mt-1 text-[11px] font-semibold text-emerald-800 underline dark:text-emerald-300"
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
                    placeholder="Code"
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
        ) : null}
      </section>

      {/* Tip — tight */}
      <section aria-labelledby="tip-heading" className="space-y-2">
        <h2 id="tip-heading" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Tip cleaner <span className="font-normal text-zinc-500">(optional)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {TIP_PRESETS.map((amount) => {
            const active = !customMode && tip === amount;
            return (
              <button
                key={amount}
                type="button"
                onClick={() => selectPreset(amount)}
                className={[
                  "rounded-lg border px-3 py-2 text-sm font-semibold transition",
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
              "rounded-lg border px-3 py-2 text-sm font-semibold transition",
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
      </section>

      {/* Your details — auth (default: guest); email first for speed */}
      <section
        id="k7z3np"
        aria-labelledby="your-details-heading"
        className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/60"
      >
        <h2 id="your-details-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Your details
        </h2>

        <div
          id="b3k9lm"
          role="tablist"
          aria-label="Checkout as"
          className="mt-3 flex gap-1.5 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800/80"
        >
          {(
            [
              ["guest", "Guest"],
              ["login", "Login"],
              ["register", "Create account"],
            ] as const
          ).map(([mode, label]) => {
            const active = authMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectAuthMode(mode)}
                className={[
                  "flex-1 rounded-md px-2 py-1.5 text-center text-xs font-semibold transition sm:text-[13px]",
                  active
                    ? "bg-white text-primary shadow dark:bg-zinc-950"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {authMode === "guest" ? (
          <div className="mt-3 space-y-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={persistGuest}
              className={inputClass}
            />
            <input
              type="text"
              autoComplete="name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={persistGuest}
              className={inputClass}
            />
            <input
              type="tel"
              autoComplete="tel"
              placeholder="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={persistGuest}
              className={inputClass}
            />
          </div>
        ) : null}

        {authMode === "login" ? (
          <div className="mt-3 space-y-3">
            {!supabaseConfigured ? (
              <p className="text-xs text-amber-800 dark:text-amber-400/90">
                Sign-in unavailable. Continue as guest.
              </p>
            ) : (
              <form onSubmit={handleLogin} className="space-y-2">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={inputClass}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    disabled={authBusy}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                  >
                    {authBusy ? "…" : "Login"}
                  </button>
                </div>
              </form>
            )}
            <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                For this booking
              </p>
              <input
                type="text"
                autoComplete="name"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={persistGuest}
                className={inputClass}
              />
              <input
                type="tel"
                autoComplete="tel"
                placeholder="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={persistGuest}
                className={inputClass}
              />
            </div>
          </div>
        ) : null}

        {authMode === "register" ? (
          <div className="mt-3 space-y-2">
            {!supabaseConfigured ? (
              <p className="text-xs text-amber-800 dark:text-amber-400/90">
                Account creation unavailable. Continue as guest.
              </p>
            ) : (
              <form onSubmit={handleRegister} className="space-y-2">
                <input
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="Phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="h-10 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
                >
                  {authBusy ? "Creating…" : "Create account"}
                </button>
              </form>
            )}
          </div>
        ) : null}

        {authError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {authError}
          </p>
        ) : null}
        {authInfo ? (
          <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-400/90">{authInfo}</p>
        ) : null}

        <p id="n6xqsd" className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          We&apos;ll only use your details for this booking and updates.
        </p>
      </section>

      {/* Trust — compact */}
      <section
        aria-label="Trust and safety"
        className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-zinc-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-zinc-200"
      >
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <span>✔ Secure payment</span>
          <span>✔ Verified cleaners</span>
          <span>✔ Satisfaction guarantee</span>
        </p>
      </section>
    </div>
  );
}
