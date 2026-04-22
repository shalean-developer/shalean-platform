"use client";

import { useCallback, useState } from "react";
import type { CheckoutNoticeTone } from "@/components/booking/CheckoutNoticeBanner";
import { PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE } from "@/lib/booking/paystackInitializeCore";

export type CheckoutNoticePayload = {
  tone: CheckoutNoticeTone;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
  autoDismissMs?: number;
};

/** Strip legacy / internal wording from any API error string. */
function looksLikeLockOrTamperMessage(raw: string): boolean {
  return /tamper|invalid\s+lock|invalid\s+or\s+tampered|booking\s+lock/i.test(raw);
}

export function useCheckoutNotice() {
  const [notice, setNotice] = useState<(CheckoutNoticePayload & { open: boolean }) | null>(null);

  const dismiss = useCallback(() => {
    setNotice(null);
  }, []);

  const show = useCallback((payload: CheckoutNoticePayload) => {
    setNotice({ ...payload, open: true });
  }, []);

  /** Map `/api/paystack/initialize` JSON to a safe, user-facing notice. */
  const showFromPaystackResponse = useCallback(
    (data: { error?: string; errorCode?: string }, options?: { onChooseAnotherTime?: () => void }) => {
      const code = data.errorCode;
      const raw = typeof data.error === "string" ? data.error : "";

      if (code === PAYSTACK_ERROR_TIME_SLOT_UNAVAILABLE || looksLikeLockOrTamperMessage(raw)) {
        show({
          tone: "danger",
          title: "Time slot unavailable",
          description: "This time was just booked. Please choose another available slot.",
          autoDismissMs: 4000,
          cta: options?.onChooseAnotherTime
            ? { label: "Choose another time", onClick: options.onChooseAnotherTime }
            : undefined,
        });
        return;
      }

      if (code === "AMOUNT_MISMATCH") {
        show({
          tone: "danger",
          title: "Price updated",
          description: "The total no longer matches your quote. Refresh the page and try again.",
          autoDismissMs: 5000,
        });
        return;
      }

      if (code === "SESSION_EXPIRED") {
        show({
          tone: "danger",
          title: "Session expired",
          description: "Sign in again or continue as guest to complete payment.",
          autoDismissMs: 5000,
        });
        return;
      }

      show({
        tone: "danger",
        title: "Payment couldn’t start",
        description: "Something went wrong. Please try again in a moment.",
        autoDismissMs: 4000,
      });
    },
    [show],
  );

  const showNetworkError = useCallback(() => {
    show({
      tone: "danger",
      title: "Connection problem",
      description: "Check your internet connection and try again.",
      autoDismissMs: 4000,
    });
  }, [show]);

  const showSuccess = useCallback((payload: Omit<CheckoutNoticePayload, "tone">) => {
    show({ ...payload, tone: "success" });
  }, [show]);

  return {
    notice,
    dismiss,
    show,
    showFromPaystackResponse,
    showNetworkError,
    showSuccess,
  };
}

