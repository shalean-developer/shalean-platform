"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PaymentPage } from "@/components/payment/PaymentPage";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { clampTipZar } from "@/lib/payments/bookingPaymentSummary";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import { initializePayment } from "@/lib/payments/paystack";

type PaystackTransaction = { reference?: string };

type PaymentCheckoutClientProps = {
  summary: BookingPaymentSummary;
};

function buildInlinePaystackMetadata(summary: BookingPaymentSummary, email: string, tip: number): Record<string, string> {
  const totalZar = summary.priceZar + tip;
  const visitTotalZar = summary.priceZar;
  const subtotalZar = Math.max(0, summary.bookingCoreZar + summary.serviceFeeZar);
  const priceSnapshot = {
    version: 1,
    currency: "ZAR",
    total_zar: totalZar,
    subtotal_zar: subtotalZar,
    extras_total_zar: summary.extrasTotalZar,
    discount_zar: 0,
    tip_zar: tip,
    visit_total_zar: visitTotalZar,
    duration_hours: summary.hours ?? 0,
    cleaners_count: summary.cleanersCount,
    line_items: [{ id: "booking_total", name: "Booking total", amount_zar: visitTotalZar }],
    pricing_version_id: null as string | null,
  };
  const extrasSlugs = summary.extras.map((x) => (typeof x.slug === "string" ? x.slug : x.name ?? "")).filter((s) => s.length > 0);
  const bookingCtx = {
    service: summary.service,
    date: summary.dateYmd,
    time: summary.timeHm,
    cleaners: summary.cleanersCount,
    extras: extrasSlugs,
    rooms: summary.bedrooms,
    bathrooms: summary.bathrooms,
  };
  return {
    shalean_booking_id: summary.id,
    booking_id: summary.id,
    booking_json: summary.bookingSnapshotJson ?? "",
    customer_email: email,
    customer_name: summary.customerName ?? "",
    customer_phone: summary.customerPhone ?? "",
    customer_user_id: summary.customerUserId ?? "",
    customer_type: summary.customerUserId ? "login" : "guest",
    userId: summary.customerUserId ?? "",
    tip_zar: String(tip),
    discount_zar: "0",
    promo_code: "",
    locked_final_zar: String(summary.priceZar),
    pay_total_zar: String(totalZar),
    expected_total_zar: String(totalZar),
    quote_signature: "",
    lock_expires_at: "",
    cleaner_id: "",
    cleaner_name: summary.cleanerName ?? "",
    referral_checkout_applied: "0",
    referral_checkout_code: "",
    referral_checkout_referrer_type: "",
    referral_checkout_referrer_id: "",
    referral_checkout_discount_zar: "0",
    referral_lock_validated_at: "",
    referral_checkout_fingerprint: "",
    price_snapshot: JSON.stringify(priceSnapshot),
    booking: JSON.stringify(bookingCtx),
  };
}

export function PaymentCheckoutClient({ summary }: PaymentCheckoutClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tipZar, setTipZar] = useState(0);
  const [coverOn, setCoverOn] = useState(true);
  const [walletOn, setWalletOn] = useState(false);

  const verifyAndFinish = useCallback(
    async (reference: string, _tipAtCharge: number) => {
      const ref = reference.trim();
      if (!ref) {
        setError("Missing payment reference. Try again or contact support.");
        return;
      }
      const res = await fetch("/api/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });
      const json = (await res.json()) as PaystackVerifyPostResponse;
      const errText =
        json.success === false && typeof json.error === "string" && json.error.trim()
          ? json.error.trim()
          : "Verification failed.";
      if (!res.ok || json.success !== true || json.ok !== true || json.paymentStatus !== "success") {
        setError(errText);
        return;
      }
      const state = json.state;
      if (state === "payment_mismatch" || state === "payment_reconciliation_required") {
        setError(
          typeof json.upsertError === "string" && json.upsertError.trim()
            ? json.upsertError.trim()
            : "Payment could not be matched to this booking. Contact support with your Paystack reference.",
        );
        return;
      }
      if (!json.bookingInDatabase || !json.bookingId) {
        setError(
          typeof json.upsertError === "string" && json.upsertError.trim()
            ? json.upsertError.trim()
            : "Payment received — your booking is still being saved. Check your email or bookings shortly.",
        );
        return;
      }
      router.push(`/payment/success?reference=${encodeURIComponent(ref)}`);
    },
    [router],
  );

  const handlePay = useCallback(() => {
    setError(null);
    setMessage(null);
    const email = summary.email?.trim() ?? "";
    if (!email) {
      setError("This booking has no customer email. Contact support.");
      return;
    }
    const tip = clampTipZar(tipZar);
    const amount = Math.max(100, Math.round((summary.priceZar + tip) * 100));
    const paystackRef = `pay_${crypto.randomUUID()}`;
    const metadata = buildInlinePaystackMetadata(summary, email, tip);
    if (typeof metadata.price_snapshot !== "string" || !metadata.price_snapshot.trim()) {
      setError("Invalid checkout preview. Refresh and try again.");
      return;
    }
    console.log("[PAYSTACK INIT METADATA]", metadata);
    setBusy(true);
    try {
      initializePayment({
        email,
        amount,
        reference: paystackRef,
        metadata,
        onSuccess: async (transaction: PaystackTransaction) => {
          const ref =
            typeof transaction?.reference === "string" && transaction.reference.trim()
              ? transaction.reference.trim()
              : paystackRef;
          try {
            await verifyAndFinish(ref, tip);
          } finally {
            setBusy(false);
          }
        },
        onCancel: () => {
          setBusy(false);
          setMessage("Payment cancelled.");
        },
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Could not start checkout.");
    }
  }, [summary, tipZar, verifyAndFinish]);

  const totalZar = summary.priceZar + clampTipZar(tipZar);
  const payDisabled = totalZar <= 0 || !summary.email?.trim();

  return (
    <PaymentPage
      summary={summary}
      tipZar={clampTipZar(tipZar)}
      onTipZarChange={(n) => setTipZar(clampTipZar(n))}
      coverOn={coverOn}
      onCoverChange={setCoverOn}
      walletOn={walletOn}
      onWalletChange={setWalletOn}
      busy={busy}
      error={error}
      message={message}
      onPay={handlePay}
      onBack={() => router.push("/dashboard/bookings")}
      payDisabled={payDisabled}
    />
  );
}
