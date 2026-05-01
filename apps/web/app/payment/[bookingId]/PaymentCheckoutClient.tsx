"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PaymentPage } from "@/components/payment/PaymentPage";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { clampTipZar } from "@/lib/payments/bookingPaymentSummary";
import { initializePayment } from "@/lib/payments/paystack";

type PaystackTransaction = { reference?: string };

type PaymentCheckoutClientProps = {
  summary: BookingPaymentSummary;
};

export function PaymentCheckoutClient({ summary }: PaymentCheckoutClientProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tipZar, setTipZar] = useState(0);
  const [coverOn, setCoverOn] = useState(true);
  const [walletOn, setWalletOn] = useState(false);

  const verifyAndFinish = useCallback(
    async (reference: string, tipAtCharge: number) => {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, tipZar: clampTipZar(tipAtCharge) }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; bookingId?: string };
      if (!res.ok || json.ok !== true) {
        setError(typeof json.error === "string" ? json.error : "Verification failed.");
        return;
      }
      router.push(`/payment/success?bookingId=${encodeURIComponent(json.bookingId ?? summary.id)}`);
    },
    [router, summary.id],
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
    setBusy(true);
    try {
      initializePayment({
        email,
        amount,
        reference: summary.id,
        onSuccess: async (transaction: PaystackTransaction) => {
          const ref = typeof transaction?.reference === "string" ? transaction.reference.trim() : summary.id;
          try {
            await verifyAndFinish(ref || summary.id, tip);
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
  }, [summary.email, summary.id, summary.priceZar, tipZar, verifyAndFinish]);

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
