"use client";

import { ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { PaymentCheckoutReview } from "@/components/booking/checkout/PaymentCheckoutReview";
import { PaymentMethodDisplay } from "@/components/booking/checkout/PaymentMethodDisplay";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { computeCheckoutTotalZar } from "@/lib/booking/checkoutTotal";
import { readGuestUserFromStorage, writeGuestUserToStorage } from "@/lib/booking/guestUserStorage";
import { getPromoDiscountZar } from "@/lib/booking/promoCodes";
import { formatLockedAppointmentLabel, type LockedBooking } from "@/lib/booking/lockedBooking";
import {
  BOOKING_PROMO_QUERY,
  sanitizeBookingPromoParam,
} from "@/lib/booking/bookingFlow";
import { bookingCopy } from "@/lib/booking/copy";
import { useBookingPrice } from "@/components/booking/BookingPriceContext";
import {
  computeBundledExtrasTotalZarSnapshot,
  extrasLineItemsFromSnapshot,
} from "@/lib/pricing/extrasConfig";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useStoredReferralCheckoutDiscount } from "@/hooks/useStoredReferralCheckoutDiscount";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import { useAuth } from "@/lib/auth/useAuth";
import { getBookingSummaryServiceLabel } from "./serviceCategories";
import { normalizeVipTier, vipTierDisplayName } from "@/lib/pricing/vipTier";
import { TrustReinforcementCard } from "@/components/booking/payment/TrustReinforcementCard";

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
  onTotalsChange: (totals: Step4Totals) => void;
  /** When true, promo UI renders in `promoTipPortalEl` (desktop checkout sidebar) instead of the main column accordion. */
  checkoutPromoInSidebar?: boolean;
  /** Mount element for promo when `checkoutPromoInSidebar` — set by parent when desktop sidebar host is ready. */
  promoTipPortalEl?: HTMLDivElement | null;
};

export const Step4Payment = forwardRef<Step4PaymentHandle, Step4PaymentProps>(function Step4Payment(
  {
    locked,
    cleanerName,
    onTotalsChange,
    checkoutPromoInSidebar = false,
    promoTipPortalEl = null,
  },
  ref,
) {
  const searchParams = useSearchParams();
  const urlPromoAppliedRef = useRef(false);
  const { catalog, canonicalTotalZar } = useBookingPrice();

  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{
    code: string;
    discountZar: number;
    description: string;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    if (urlPromoAppliedRef.current) return;
    const code = sanitizeBookingPromoParam(searchParams.get(BOOKING_PROMO_QUERY));
    if (!code) return;
    const result = getPromoDiscountZar(code, locked.finalPrice);
    if (!result) return;
    urlPromoAppliedRef.current = true;
    setPromoInput(code);
    setPromoApplied({
      code,
      discountZar: result.discountZar,
      description: result.description,
    });
    setPromoError(null);
  }, [searchParams, locked.finalPrice]);

  const recurringDiscount = useMemo(() => {
    const f = locked.cleaningFrequency ?? "one_time";
    if (f === "weekly") return { amount: Math.round(locked.finalPrice * 0.1), frequency: f };
    if (f === "biweekly") return { amount: Math.round(locked.finalPrice * 0.05), frequency: f };
    return null;
  }, [locked.cleaningFrequency, locked.finalPrice]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sessionUser, setSessionUser] = useState<{ id: string; accessToken: string } | null>(null);
  const { user } = useAuth();
  const { referralDiscount } = useStoredReferralCheckoutDiscount(email);

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
        setSessionUser({ id: sess.user.id, accessToken: sess.access_token });
        const em = sess.user.email?.trim() ?? "";
        if (em) setEmail(em);
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

  const discountZar = (promoApplied?.discountZar ?? 0) + (referralDiscount?.discountZar ?? 0) + (recurringDiscount?.amount ?? 0);

  const totalZar = useMemo(
    () => computeCheckoutTotalZar(locked.finalPrice, 0, discountZar),
    [locked.finalPrice, discountZar],
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
      tipZar: 0,
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

  const payCopy = bookingCopy.checkoutPayment;
  const checkoutMicro = bookingCopy.checkout;

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

  const extrasLine = useMemo(() => {
    if (!locked.extras.length) return payCopy.extrasNone;
    if (!catalog) return payCopy.extrasSelected(locked.extras.length);
    const rows = extrasLineItemsFromSnapshot(catalog, locked.extras, locked.service);
    if (locked.extras.length <= 3 && rows.length > 0) {
      const joined = rows.map((r) => r.name).filter(Boolean).join(", ");
      return joined || payCopy.extrasSelected(locked.extras.length);
    }
    return payCopy.extrasSelected(locked.extras.length);
  }, [catalog, locked.extras, locked.service]);

  const visitTotalZar = locked.finalPrice;
  const extrasTotalZar = Math.max(0, extrasBundledZar);
  const showExtrasRetailBreakdown =
    extrasTotalZar > 0 && extrasRetailRows.length > 0 && extrasRetailSumZar >= extrasTotalZar;
  const extrasBundleSavingsDisplayZar = showExtrasRetailBreakdown
    ? Math.max(0, extrasRetailSumZar - extrasTotalZar)
    : 0;
  const serviceSubtotalZar = Math.max(0, visitTotalZar - extrasTotalZar);
  const anchorPrice =
    canonicalTotalZar != null && Number.isFinite(canonicalTotalZar) && canonicalTotalZar > 0
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

  const cleanerDisplay =
    cleanerName?.trim() && cleanerName.trim() !== "Auto-assigned cleaner"
      ? `${payCopy.cleanerSelectedShort}: ${cleanerName.trim()}`
      : payCopy.cleanerBestAvailable;

  const inputClass =
    "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none ring-primary/30 placeholder:text-zinc-400 focus:border-primary focus:ring-1 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-primary";

  const promoFields = (
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
  );

  const detailedPricing = (
    <details className="group rounded-xl border border-zinc-200/70 bg-zinc-50/40 dark:border-zinc-700/80 dark:bg-zinc-900/25">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-400 [&::-webkit-details-marker]:hidden">
        <span>View detailed pricing</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 dark:text-zinc-400"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-3 text-sm dark:border-zinc-800/80">
        <div className="space-y-0 rounded-lg border border-zinc-200/80 bg-white/80 text-sm dark:border-zinc-700 dark:bg-zinc-950/40">
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
          <div className="flex items-center justify-between border-t border-zinc-200/80 px-3 py-3 text-zinc-700 dark:border-zinc-700/80 dark:text-zinc-300">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Extras</span>
            <span className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
              R {formatZar(extrasTotalZar)}
            </span>
          </div>
          <div className="border-t border-zinc-300/80 dark:border-zinc-600/80" role="separator" />
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Visit total</span>
            <span className="text-base font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
              R {formatZar(visitTotalZar)}
            </span>
          </div>
        </div>

        {showSavingsSection ? (
          <div className="space-y-1.5 rounded-lg border border-emerald-200/60 bg-emerald-50/40 px-3 py-3 text-[11px] leading-snug text-emerald-950 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-100">
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
                You saved R {formatZar(Math.abs(pricingDeltaZar))} compared with our usual reference time for this job (
                {Math.abs(pricingDeltaPercent)}%). Already reflected in your visit total.
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

        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{checkoutMicro.pricingRoundingNote}</p>

        {checkoutDiscountLines.length > 0 ? (
          <div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-700">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Applied at payment</p>
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
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-3 dark:border-primary/30 dark:bg-primary/[0.1]">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Total to pay
          </span>
          <span className="text-lg font-bold tabular-nums text-primary">R {formatZar(totalZar)}</span>
        </div>
        <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-snug text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
          {checkoutMicro.extrasGuarantee}
        </p>
      </div>
    </details>
  );

  return (
    <div className="mx-auto w-full max-w-[576px] space-y-3 rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/70 sm:space-y-4 sm:p-5">
      <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 dark:border-emerald-800/50 dark:bg-emerald-950/25">
        <p className="text-[13px] font-semibold leading-snug text-emerald-900 dark:text-emerald-100">Almost there</p>
        <p className="mt-0.5 text-[12px] leading-snug text-emerald-800/90 dark:text-emerald-200/85">
          Complete secure payment to confirm your booking.
        </p>
      </div>

      <PaymentCheckoutReview
        whatLabel={serviceName}
        summaryHours={locked.finalHours}
        scheduleLine={formatLockedAppointmentLabel(locked)}
        whereLabel={locked.location?.trim() || "Address on file"}
        cleanerLabel={cleanerDisplay}
        extrasLine={extrasLine}
        summaryTotalZar={totalZar}
        loading={false}
      />

      <TrustReinforcementCard />

      <BookingSectionCard className="p-4 sm:p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {payCopy.paymentMethodTitle}
        </p>
        <PaymentMethodDisplay footerTrust={false} />
      </BookingSectionCard>

      {detailedPricing}

      {checkoutPromoInSidebar && promoTipPortalEl
        ? createPortal(
            <div className="space-y-3 text-sm text-zinc-900 dark:text-zinc-100">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">Promo code (optional)</p>
              {promoFields}
            </div>,
            promoTipPortalEl,
          )
        : null}

      {!checkoutPromoInSidebar ? (
        <details className="group overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-950/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
            <span>Promo code (optional)</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 dark:text-zinc-400"
              aria-hidden
            />
          </summary>
          <div className="border-t border-zinc-200/80 px-4 pb-4 pt-3 dark:border-zinc-800">{promoFields}</div>
        </details>
      ) : null}

      <Dialog open={contactDialogOpen} onOpenChange={handleContactDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Contact details</DialogTitle>
            <DialogDescription>
              {sessionUser
                ? "Signed in. Confirm your details before payment."
                : "Enter the details we’ll use for your booking confirmation."}
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
          </div>
          {cleanerName ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Cleaner: {cleanerName}</p>
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
              Pay & confirm booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

Step4Payment.displayName = "Step4Payment";
