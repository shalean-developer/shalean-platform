"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import BookingContainer from "@/components/layout/BookingContainer";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

async function verifyReference(ref: string): Promise<{ ok: boolean; reference?: string; error?: string }> {
  const trimmed = ref.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter your Paystack payment reference." };
  }
  const res = await fetch("/api/paystack/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: trimmed }),
  });
  const data = (await res.json()) as PaystackVerifyPostResponse;
  if (res.ok && data.success && data.paymentStatus === "success") {
    return { ok: true, reference: data.reference };
  }
  return {
    ok: false,
    error:
      data.success === false && "error" in data && data.error
        ? data.error
        : "Could not verify this reference.",
  };
}

function RecoverContent() {
  const searchParams = useSearchParams();
  const fromQuery = searchParams.get("reference")?.trim() ?? "";
  const [reference, setReference] = useState(() => searchParams.get("reference")?.trim() ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    if (!fromQuery || autoRan.current) return;
    autoRan.current = true;
    setLoading(true);
    setMessage(null);
    void verifyReference(fromQuery)
      .then((r) => {
        if (r.ok && r.reference) {
          window.location.href = `/booking/success?reference=${encodeURIComponent(r.reference)}`;
          return;
        }
        setMessage(r.error ?? null);
      })
      .catch(() => setMessage("Network error. Try again."))
      .finally(() => setLoading(false));
  }, [fromQuery]);

  const verify = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const r = await verifyReference(reference);
      if (r.ok && r.reference) {
        window.location.href = `/booking/success?reference=${encodeURIComponent(r.reference)}`;
        return;
      }
      setMessage(r.error ?? null);
    } catch {
      setMessage("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  return (
    <BookingContainer className="py-12 sm:py-16">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Recover booking</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Paste the payment reference from your email or bank SMS. We&apos;ll verify your payment and open your
          confirmation.
        </p>
        <label className="mt-6 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Reference
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="e.g. T1234567890"
            autoComplete="off"
          />
        </label>
        {message ? (
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-400/90" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="button"
          disabled={loading}
          onClick={() => void verify()}
          className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify & continue"}
        </button>
        <Link
          href={bookingFlowHref("entry")}
          className="mt-4 block text-center text-sm font-medium text-primary"
        >
          Back to booking
        </Link>
      </div>
    </BookingContainer>
  );
}

export default function BookingRecoverPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <Suspense
        fallback={
          <BookingContainer className="py-16">
            <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          </BookingContainer>
        }
      >
        <RecoverContent />
      </Suspense>
    </div>
  );
}
