"use client";

import { useCallback, useState } from "react";
import type { CheckoutNoticeTone } from "@/components/booking/CheckoutNoticeBanner";
import { CONFIG_MISSING_BOOKING_LOCK_HMAC } from "@/lib/booking/bookingLockHmacSecret";
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

      if (code === "LOCK_EXPIRED") {
        show({
          tone: "danger",
          title: "Price hold expired",
          description: "Choose your time again to refresh your quote, then continue to payment.",
          autoDismissMs: 6000,
          cta: options?.onChooseAnotherTime
            ? { label: "Choose another time", onClick: options.onChooseAnotherTime }
            : undefined,
        });
        return;
      }

      if (code === "REQUOTE_REQUIRED" || code === "SIGNATURE_INVALID") {
        show({
          tone: "danger",
          title: "Quote needs a refresh",
          description:
            typeof data.error === "string" && data.error.trim()
              ? data.error
              : "Choose your time again to lock an up-to-date price, then continue.",
          autoDismissMs: 7000,
          cta: options?.onChooseAnotherTime
            ? { label: "Choose another time", onClick: options.onChooseAnotherTime }
            : undefined,
        });
        return;
      }

      if (code === "PRICE_MISMATCH" || code === "DURATION_MISMATCH") {
        show({
          tone: "danger",
          title: "Price updated",
          description:
            typeof data.error === "string" && data.error.trim()
              ? data.error
              : "Availability or demand changed. Re-lock your slot to continue.",
          autoDismissMs: 7000,
          cta: options?.onChooseAnotherTime
            ? { label: "Choose another time", onClick: options.onChooseAnotherTime }
            : undefined,
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

      if (code === "PAYSTACK_SECRET_MISSING" || code === CONFIG_MISSING_BOOKING_LOCK_HMAC) {
        show({
          tone: "danger",
          title: "Payment couldn’t start",
          description: "Something went wrong on our side. Please try again in a moment.",
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

