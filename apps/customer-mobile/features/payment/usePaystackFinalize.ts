import { useCallback, useEffect, useRef, useState } from "react";
import {
  mapVerifyFailureToPhase,
  mapVerifySuccessToPhase,
} from "@/lib/payment/mapFinalizePhase";
import {
  STATUS_POLL_DELAY_MS,
  STATUS_POLL_MAX_ATTEMPTS,
  VERIFY_MAX_ATTEMPTS,
  VERIFY_RETRY_DELAY_MS,
} from "@/lib/payment/verifyConstants";
import { getPaystackApi } from "@/services/customerApi";
import type {
  PaymentFinalizePhase,
  PaymentFinalizeResult,
  PaystackStatusResponse,
  PaystackVerifyResponse,
} from "@/features/payment/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilNotPendingPayment(
  reference: string,
): Promise<PaystackStatusResponse | null> {
  let last: PaystackStatusResponse | null = null;
  for (let i = 0; i < STATUS_POLL_MAX_ATTEMPTS; i++) {
    const res = await getPaystackApi().status<PaystackStatusResponse>(reference);
    if (res.ok) {
      last = res.data;
      const status = (res.data.status ?? "").trim().toLowerCase();
      if (status && status !== "pending_payment" && status !== "unknown") {
        return last;
      }
    }
    if (i < STATUS_POLL_MAX_ATTEMPTS - 1) {
      await sleep(STATUS_POLL_DELAY_MS);
    }
  }
  return last;
}

export async function runPaystackFinalize(reference: string): Promise<PaymentFinalizeResult> {
  const ref = reference.trim();
  if (!ref) {
    return {
      phase: "failed",
      bookingId: null,
      bookingReference: null,
      errorMessage: "Missing payment reference.",
      paymentStatus: null,
    };
  }

  for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
    const exhausted = attempt >= VERIFY_MAX_ATTEMPTS;
    try {
      const res = await getPaystackApi().verify<PaystackVerifyResponse>({ reference: ref });
      const data = res.ok ? res.data : (res.body as PaystackVerifyResponse | undefined);

      if (res.ok && data && data.success === true && data.paymentStatus === "success") {
        let status: PaystackStatusResponse | null = null;
        const mapped = mapVerifySuccessToPhase(data, null);
        if (mapped.phase === "persist_pending") {
          status = await pollUntilNotPendingPayment(ref);
          return mapVerifySuccessToPhase(data, status);
        }
        return mapped;
      }

      if (data && data.success === false) {
        const failMapped = mapVerifyFailureToPhase(data, exhausted);
        if (failMapped) return failMapped;
        await sleep(VERIFY_RETRY_DELAY_MS);
        continue;
      }

      if (!exhausted) {
        await sleep(VERIFY_RETRY_DELAY_MS);
        continue;
      }

      return {
        phase: "needs_retry",
        bookingId: null,
        bookingReference: null,
        errorMessage: res.ok
          ? "Could not verify payment."
          : res.error || `Request failed (${res.status}).`,
        paymentStatus: "unknown",
      };
    } catch {
      if (!exhausted) {
        await sleep(VERIFY_RETRY_DELAY_MS);
        continue;
      }
      return {
        phase: "needs_retry",
        bookingId: null,
        bookingReference: null,
        errorMessage: "Network error.",
        paymentStatus: null,
      };
    }
  }

  return {
    phase: "needs_retry",
    bookingId: null,
    bookingReference: null,
    errorMessage: "Could not verify payment.",
    paymentStatus: "unknown",
  };
}

export function usePaystackFinalize(reference: string | undefined | null) {
  const [phase, setPhase] = useState<PaymentFinalizePhase>(() =>
    reference?.trim() ? "finalizing" : "failed",
  );
  const [result, setResult] = useState<PaymentFinalizeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    reference?.trim() ? null : "Missing payment reference.",
  );
  const runIdRef = useRef(0);

  const finalize = useCallback(async () => {
    const ref = reference?.trim();
    if (!ref) {
      setPhase("failed");
      setErrorMessage("Missing payment reference.");
      return;
    }
    const runId = ++runIdRef.current;
    setPhase("finalizing");
    setErrorMessage(null);
    const next = await runPaystackFinalize(ref);
    if (runId !== runIdRef.current) return;
    setResult(next);
    setPhase(next.phase);
    setErrorMessage(next.errorMessage);
  }, [reference]);

  useEffect(() => {
    if (!reference?.trim()) return;
    void finalize();
  }, [reference, finalize]);

  return {
    phase,
    result,
    errorMessage,
    bookingId: result?.bookingId ?? null,
    bookingReference: result?.bookingReference ?? null,
    retry: finalize,
  };
}
