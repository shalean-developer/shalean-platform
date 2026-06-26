"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { GuestDocumentFooter } from "@/components/public/GuestDocumentFooter";

type Phase = "missing" | "finalizing" | "paid" | "failed";

async function verifyMonthlyInvoicePayment(reference: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const res = await fetch("/api/paystack/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    ok?: boolean;
    monthlyInvoiceId?: string | null;
    state?: string;
    error?: string;
  };
  const paid =
    res.ok &&
    (data.success || data.ok) &&
    (Boolean(data.monthlyInvoiceId) ||
      (typeof data.state === "string" && data.state.startsWith("monthly_invoice")));
  if (paid) return { ok: true };
  return { ok: false, error: data.error ?? (res.ok ? undefined : `Error ${res.status}`) };
}

function MonthlyInvoicePaymentSuccessContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const invoiceId = typeof params?.invoiceId === "string" ? params.invoiceId : "";
  const reference = searchParams.get("reference") ?? searchParams.get("trxref") ?? "";

  const mountedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>(() => (reference ? "finalizing" : "missing"));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runVerify = useCallback(async () => {
    if (!reference || !mountedRef.current) return;
    setPhase("finalizing");
    setMessage(null);

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (!mountedRef.current) return;
      try {
        const result = await verifyMonthlyInvoicePayment(reference);
        if (!mountedRef.current) return;
        if (result.ok) {
          setPhase("paid");
          return;
        }
        if (result.error) setMessage(result.error);
      } catch {
        if (!mountedRef.current) return;
        setMessage("Network error while confirming payment.");
      }
      if (attempt < 3 && mountedRef.current) {
        await new Promise((r) => window.setTimeout(r, 1500));
      }
    }
    if (mountedRef.current) setPhase("failed");
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    void runVerify();
  }, [reference, runVerify]);

  if (phase === "missing") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Payment reference missing</h1>
        <p className="text-sm text-neutral-600">Return to the pay link from your invoice email.</p>
        <GuestDocumentFooter redirectPath="/account/invoices" />
      </main>
    );
  }

  if (phase === "finalizing") {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Confirming your payment…</h1>
        <p className="text-sm text-neutral-600">This usually takes a few seconds.</p>
      </main>
    );
  }

  if (phase === "paid") {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Payment received</h1>
        <p className="mt-2 text-sm text-neutral-600">Thank you — your monthly invoice is marked as paid.</p>
        {invoiceId ? (
          <Link
            href={`/account/invoices/${invoiceId}`}
            className="mt-8 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View invoice
          </Link>
        ) : null}
        <GuestDocumentFooter redirectPath="/account/invoices" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">We could not confirm payment yet</h1>
      <p className="text-sm text-neutral-600">
        {message ??
          "If Paystack charged your card, we will update the invoice shortly. Contact Shalean if this persists."}
      </p>
      <button
        type="button"
        onClick={() => void runVerify()}
        className="mx-auto rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
      >
        Try again
      </button>
      <GuestDocumentFooter redirectPath="/account/invoices" />
    </main>
  );
}

export default function MonthlyInvoicePaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
          <p className="text-sm text-neutral-600">Loading…</p>
        </main>
      }
    >
      <MonthlyInvoicePaymentSuccessContent />
    </Suspense>
  );
}
