"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bookingId: string;
  reference: string;
  authorizationUrl?: string;
  mode: "checkout" | "retry_only";
  initialError?: string;
};

/**
 * Client checkout controls for `/pay/[bookingId]`.
 * Recovers a fresh session via the payment-session API when the stored link fails or expires.
 */
export function PayBookingCheckoutClient({
  bookingId,
  reference,
  authorizationUrl,
  mode,
  initialError,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const openCheckout = useCallback(
    async (url: string) => {
      // Hard navigation is more reliable on mobile / in-app browsers than popup SDKs.
      window.location.assign(url);
    },
    [],
  );

  const ensureAndOpen = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/payment-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const json = (await res.json()) as {
        status?: string;
        authorizationUrl?: string;
        reference?: string;
        error?: string;
        message?: string;
        retryable?: boolean;
      };

      if (json.status === "paid") {
        const ref = (json.reference ?? reference).trim();
        router.push(`/account/success?reference=${encodeURIComponent(ref)}`);
        return;
      }

      if (json.status === "ready" && typeof json.authorizationUrl === "string" && json.authorizationUrl.trim()) {
        if (json.message) setInfo(json.message);
        await openCheckout(json.authorizationUrl.trim());
        return;
      }

      setError(
        typeof json.error === "string" && json.error.trim()
          ? json.error.trim()
          : "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
      );
    } catch {
      setError(
        "We could not start the secure payment checkout. Your booking is safe and no payment was taken. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, bookingId, reference, openCheckout, router]);

  if (mode === "checkout" && authorizationUrl) {
    return (
      <div className="flex flex-col gap-2">
        {info ? <p className="text-center text-sm text-amber-800">{info}</p> : null}
        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void openCheckout(authorizationUrl);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : "Pay now — secure checkout"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void ensureAndOpen()}
          className="text-center text-xs font-medium text-blue-600 hover:underline disabled:opacity-60"
        >
          Having trouble? Refresh payment session
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {error ? <p className="text-sm text-neutral-600">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void ensureAndOpen()}
        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? "Creating secure checkout…" : "Try payment again"}
      </button>
    </div>
  );
}
