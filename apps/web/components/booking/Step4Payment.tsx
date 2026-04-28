"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, startTransition, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { computeCheckoutTotalZar, MAX_TIP_ZAR } from "@/lib/booking/checkoutTotal";
import { readGuestUserFromStorage, writeGuestUserToStorage } from "@/lib/booking/guestUserStorage";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import { formatLockedAppointmentLabel, type LockedBooking } from "@/lib/booking/lockedBooking";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import {
  computeBundledExtrasTotalZarSnapshot,
  extrasLineItemsFromSnapshot,
} from "@/lib/pricing/extrasConfig";
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

export type Step4PaymentHandle = {
  /** Opens contact details in a dialog; calls `continueToPay` after the user confirms valid details. */
  runPayWithContactDialog: (continueToPay: () => void | Promise<void>) => void;
};

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
  /** When true, promo/tip render in `promoTipPortalEl` (desktop checkout sidebar) instead of the main column accordion. */
  checkoutPromoInSidebar?: boolean;
  /** Mount element for promo/tip when `checkoutPromoInSidebar` — set by parent when desktop sidebar host is ready. */
  promoTipPortalEl?: HTMLDivElement | null;
};

export const Step4Payment = forwardRef<Step4PaymentHandle, Step4PaymentProps>(function Step4Payment(
  {
    locked,
    cleanerName,
    preferRegisterTab,
    authOverride,
    onTotalsChange,
    checkoutPromoInSidebar = false,
    promoTipPortalEl = null,
  },
  ref,
) {
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
    if (f === "weekly") return { amount: Math.round(locked.finalPrice * 0.1), frequency: f };
    if (f === "biweekly") return { amount: Math.round(locked.finalPrice * 0.05), frequency: f };
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
        label: "Discount (promo)",
        amount: promoApplied.discountZar,
      });
    }
    if (referralDiscount && referralDiscount.discountZar > 0) {
      lines.push({
        key: "referral",
        label: "Discount (referral)",
        amount: referralDiscount.discountZar,
      });
    }
    if (recurringDiscount && recurringDiscount.amount > 0) {
      lines.push({
        key: "plan",
        label: "Discount (subscription)",
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

  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactDialogError, setContactDialogError] = useState<string | null>(null);
  const continuePayRef = useRef<(() => void | Promise<void>) | null>(null);

  useImperativeHandle(ref, () => ({
    runPayWithContactDialog: (continueToPay) => {
      continuePayRef.current = continueToPay;
      setContactDialogError(null);
      setContactDialogOpen(true);
    },
  }));

  function handleContactDialogOpenChange(open: boolean) {
    if (!open) {
      continuePayRef.current = null;
      setContactDialogError(null);
    }
    setContactDialogOpen(open);
  }

  function submitContactDialog() {
    if (!contactFieldsValid(name, email, phone)) {
      setContactDialogError("Enter your full name, a valid phone number, and email.");
      return;
    }
    setContactDialogError(null);
    persistGuest();
    const next = continuePayRef.current;
    continuePayRef.current = null;
    setContactDialogOpen(false);
    queueMicrotask(() => void next?.());
  }

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
    const envOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : envOrigin || "https://www.shalean.co.za";
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

  const extrasBundledZar = useMemo(() => {
    if (!catalog) return 0;
    return computeBundledExtrasTotalZarSnapshot(catalog, locked.extras, locked.service);
  }, [catalog, locked.extras, locked.service]);

  const extrasRetailRows = useMemo(() => {
    if (!catalog || !locked.service || locked.extras.length === 0) return [];
    return extrasLineItemsFromSnapshot(catalog, locked.extras, locked.service);
  }, [catalog, locked.extras, locked.service]);

  const extrasRetailSumZar = useMemo(
    () => extrasRetailRows.reduce((s, r) => s + Math.max(0, Math.round(Number(r.price) || 0)), 0),
    [extrasRetailRows],
  );

  const checkoutMicro = bookingCopy.checkout;
  const visitTotalZar = locked.finalPrice;
  const extrasTotalZar = Math.max(0, extrasBundledZar);
  const showExtrasRetailBreakdown =
    extrasTotalZar > 0 && extrasRetailRows.length > 0 && extrasRetailSumZar >= extrasTotalZar;
  const extrasBundleSavingsDisplayZar = showExtrasRetailBreakdown
    ? Math.max(0, extrasRetailSumZar - extrasTotalZar)
    : 0;
  const serviceSubtotalZar = Math.max(0, visitTotalZar - extrasTotalZar);
  const anchorPrice = canonicalTotalZar != null && Number.isFinite(canonicalTotalZar) && canonicalTotalZar > 0
    ? canonicalTotalZar
    : null;
  const pricingDeltaZar = anchorPrice != null ? Math.round(anchorPrice - visitTotalZar) : null;
  const pricingDeltaPercent =
    anchorPrice != null ? Math.round(((anchorPrice - visitTotalZar) / anchorPrice) * 100) : null;

  const vipSavingsEligible =
    typeof locked.quoteVipSavingsZar === "number" &&
    Number.isFinite(locked.quoteVipSavingsZar) &&
    locked.quoteVipSavingsZar > 0;
  const timeComparisonSaved =
    pricingDeltaZar != null && pricingDeltaPercent != null && pricingDeltaZar >= 10;
  const timeComparisonHigher = pricingDeltaZar != null && pricingDeltaZar < 0;
  const timeComparisonSame = pricingDeltaZar === 0 && anchorPrice != null;
  const showSavingsSection =
    vipSavingsEligible ||
    timeComparisonSaved ||
    timeComparisonHigher ||
    timeComparisonSame ||
    extrasBundleSavingsDisplayZar > 0;

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const inputClass =
    "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-1 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-primary";

  /** Promo + tip controls — promo row above tip presets (sidebar + accordion). */
  const promoTipFields = (
    <>
      <div className="space-y-2">
        {recurringDiscount ? (
          <div className="rounded-lg border border-blue-200/80 bg-blue-50/90 px-3 py-2 text-xs text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-100">
            Discount (subscription) applied.
          </div>
        ) : null}
        {referralDiscount ? (
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            Referral code {referralDiscount.code}: R {formatZar(referralDiscount.discountZar)} off your payment.
          </div>
        ) : null}
        {promoApplied ? (
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-100">
            <p className="font-medium">{promoApplied.code} applied</p>
            <button type="button" onClick={clearPromo} className="mt-1 text-[11px] font-semibold underline">
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
    </>
  );

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
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Price breakdown</h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Your visit total is the final price for this booking.
        </p>

        <div className="mt-4 space-y-0 rounded-lg border border-zinc-200/80 bg-zinc-50/70 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
          <div className="flex items-start justify-between gap-3 px-3 py-3 text-zinc-700 dark:text-zinc-300">
            <span className="min-w-0">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">Cleaning service</span>
              <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                {locked.rooms} bed · {locked.bathrooms} bath
              </span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
              R {formatZar(serviceSubtotalZar)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200/80 px-3 py-3 text-zinc-700 dark:text-zinc-300 dark:border-zinc-700/80">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Extras</span>
            <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
              R {formatZar(extrasTotalZar)}
            </span>
          </div>
          <div className="border-t border-zinc-300/80 dark:border-zinc-600/80" role="separator" />
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Visit total</span>
            <span className="text-lg font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
              R {formatZar(visitTotalZar)}
            </span>
          </div>
        </div>

        {showSavingsSection ? (
          <div className="mt-4 space-y-1.5 rounded-lg border border-emerald-200/60 bg-emerald-50/40 px-3 py-3 text-[11px] leading-snug text-emerald-950 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-100">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/90 dark:text-emerald-200/90">
              Savings and benefits
            </p>
            {vipSavingsEligible ? (
              <p>
                You saved R {formatZar(Number(locked.quoteVipSavingsZar))} with VIP{" "}
                {vipTierDisplayName(normalizeVipTier(locked.vipTier))}. Already reflected in your visit total.
              </p>
            ) : null}
            {timeComparisonSaved && pricingDeltaZar != null && pricingDeltaPercent != null ? (
              <p>
                You saved R {formatZar(Math.abs(pricingDeltaZar))} compared with our usual reference time for this job
                ({Math.abs(pricingDeltaPercent)}%). Already reflected in your visit total.
              </p>
            ) : null}
            {timeComparisonHigher ? (
              <p className="text-zinc-600 dark:text-zinc-400">
                Your selected time differs from our reference estimate; your visit total above already includes this.
              </p>
            ) : null}
            {timeComparisonSame ? (
              <p className="text-zinc-600 dark:text-zinc-400">Same as our reference-time estimate for this visit.</p>
            ) : null}
            {extrasBundleSavingsDisplayZar > 0 ? (
              <p>
                You saved R {formatZar(extrasBundleSavingsDisplayZar)} by bundling your add-ons. Already reflected in
                your visit total.
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-3 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {checkoutMicro.pricingRoundingNote}
        </p>

        {tip > 0 || checkoutDiscountLines.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-700">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Payment adjustments
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Your visit total stays as above; these items change only what you pay today.
            </p>
            {tip > 0 ? (
              <div className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300">
                <span>Tip added</span>
                <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                  R {formatZar(tip)}
                </span>
              </div>
            ) : null}
            {checkoutDiscountLines.length > 0 ? (
              <>
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Promotions applied at payment</p>
                {checkoutDiscountLines.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <span>{row.label}</span>
                    <span className="tabular-nums font-medium text-emerald-800 dark:text-emerald-300">
                      R {formatZar(row.amount)} off
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-4 dark:border-primary/35 dark:bg-primary/[0.12]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Total to pay
            </span>
            <span className="text-[1.85rem] font-bold tabular-nums leading-none tracking-tight text-primary sm:text-4xl">
              R {formatZar(totalZar)}
            </span>
          </div>
          <p className="mt-2 text-xs leading-snug text-zinc-600 dark:text-zinc-400">
            {tip > 0 || discountZar > 0
              ? "Includes your locked visit plus tip, with promotions applied as shown."
              : "Same as your visit total · Price locked for this time"}
          </p>
        </div>
        <p className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-snug text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
          {checkoutMicro.extrasGuarantee}
        </p>
      </section>

      {checkoutPromoInSidebar && promoTipPortalEl
        ? createPortal(
            <div className="space-y-4 text-sm text-zinc-900 dark:text-zinc-100">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">Add promo or tip (optional)</p>
              {promoTipFields}
            </div>,
            promoTipPortalEl,
          )
        : null}

      {!checkoutPromoInSidebar ? (
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
            <div className="space-y-4 border-t border-zinc-200/80 px-4 pb-4 pt-3 dark:border-zinc-800">{promoTipFields}</div>
          ) : null}
        </section>
      ) : null}

      <Dialog open={contactDialogOpen} onOpenChange={handleContactDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact details</DialogTitle>
            <DialogDescription>
              {sessionUser
                ? "Signed in. Confirm your details before payment."
                : "You’ll be asked to log in or sign up after you continue, if you’re not already signed in."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="text"
              required
              autoComplete="name"
              placeholder="Full name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setContactDialogError(null);
              }}
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
              onChange={(e) => {
                setPhone(e.target.value);
                setContactDialogError(null);
              }}
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
              onChange={(e) => {
                setEmail(e.target.value);
                setContactDialogError(null);
              }}
              onBlur={persistGuest}
              className={inputClass}
            />
          </div>
          {cleanerName ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cleaner: {cleanerName}</p>
          ) : null}
          {!supabaseConfigured ? (
            <p className="text-xs text-amber-800 dark:text-amber-400/90">Sign-in is currently unavailable.</p>
          ) : null}
          {contactDialogError ? (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {contactDialogError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => handleContactDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitContactDialog}>
              Continue to secure payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

Step4Payment.displayName = "Step4Payment";
