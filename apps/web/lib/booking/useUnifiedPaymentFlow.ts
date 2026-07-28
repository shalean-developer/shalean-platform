"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import { getAnalyticsSessionId } from "@/lib/analytics/sessionId";
import { getAcquisitionPayloadFields } from "@/lib/analytics/acquisitionContext";
import { getGa4CheckoutIdentityFields } from "@/lib/analytics/ga4ClientId";
import {
  ANALYTICS_EVENTS,
  trackBookingAnalyticsEvent,
  type BookingAnalyticsState,
} from "@/lib/booking/bookingFlowAnalytics";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { initializePayment } from "@/lib/payments/paystack";
import {
  buildCanonicalPaystackCheckoutMetadata,
  normalizePaystackCleanerUuid,
  parseLockTimingFromBookingSnapshotJson,
} from "@/lib/booking/bookingPaystackCheckoutMetadataFlat";
import { canonicalizeBookingServiceSlug } from "@/lib/booking/canonicalizeBookingServiceSlug";

type PaystackTransaction = { reference?: string };

export type UnifiedPaymentMode = "funnel" | "existing_booking";

/** Supports legacy URLs that used `pay_entry=funnel` with `mode=existing`. */
export function unifiedPaymentModeFromSearchParams(sp: URLSearchParams): UnifiedPaymentMode {
  if (sp.get("mode") === "funnel" || sp.get("pay_entry") === "funnel") return "funnel";
  return "existing_booking";
}

export type UnifiedPaystackMetadataContext = {
  paymentMode: UnifiedPaymentMode;
  /** Marketing / URL `source` and similar — stored as string in Paystack metadata. */
  attributionSource: string | null;
};

export function buildInlinePaystackMetadata(
  summary: BookingPaymentSummary,
  email: string,
  tip: number,
  ctx: UnifiedPaystackMetadataContext,
): Record<string, string> {
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
  const extrasSlugs = summary.extras
    .map((x) => (typeof x.slug === "string" ? x.slug : x.name ?? ""))
    .filter((s) => s.length > 0);
  const bookingCtx = {
    service: summary.service,
    date: summary.dateYmd,
    time: summary.timeHm,
    cleaners: summary.cleanersCount,
    extras: extrasSlugs,
    rooms: summary.bedrooms,
    bathrooms: summary.bathrooms,
  };
  const sessionId = getAnalyticsSessionId();
  const analyticsSessionId = sessionId === "server" ? "" : sessionId;
  const lockTiming = parseLockTimingFromBookingSnapshotJson(summary.bookingSnapshotJson);
  const selId = normalizePaystackCleanerUuid(summary.selectedCleanerId ?? "");
  let assignmentStr = summary.assignmentType?.trim() ?? "";
  if (!assignmentStr && selId) assignmentStr = "user_selected";
  const serviceSlug = canonicalizeBookingServiceSlug(summary.serviceSlug ?? summary.service);

  const acq = getAcquisitionPayloadFields();
  const gclid = typeof acq.gclid === "string" ? acq.gclid.trim() : "";
  const fbclid = typeof acq.fbclid === "string" ? acq.fbclid.trim() : "";
  const ga = getGa4CheckoutIdentityFields();

  return {
    ...buildCanonicalPaystackCheckoutMetadata({
      payment_path: "inline_checkout",
      internalBookingId: summary.id,
      booking_json: summary.bookingSnapshotJson ?? "",
      booking_snapshot_version: lockTiming.snapshotVersion,
      locked_at: lockTiming.lockedAt,
      quote_signature: lockTiming.quoteSignature,
      lock_expires_at: lockTiming.lockExpiresAt,
      selected_cleaner_id: selId,
      cleaner_name: summary.cleanerName ?? "",
      assignment_type: assignmentStr,
      service_slug: serviceSlug,
      customer_email: email,
      customer_name: summary.customerName ?? "",
      customer_phone: summary.customerPhone ?? "",
      customer_user_id: summary.customerUserId ?? "",
      customer_type: summary.customerUserId ? "login" : "guest",
      tip_zar: String(tip),
      discount_zar: "0",
      promo_code: "",
      locked_final_zar: String(summary.priceZar),
      pay_total_zar: String(totalZar),
      expected_total_zar: String(totalZar),
      price_snapshot: JSON.stringify(priceSnapshot),
      booking: JSON.stringify(bookingCtx),
      payment_mode: ctx.paymentMode,
      attribution_source: ctx.attributionSource?.trim() ?? "",
      analytics_session_id: analyticsSessionId,
    }),
    ...(gclid ? { gclid } : {}),
    ...(fbclid ? { fbclid } : {}),
    ...(ga.gaClientId ? { ga_client_id: ga.gaClientId } : {}),
    ...(ga.gaSessionId ? { ga_session_id: ga.gaSessionId } : {}),
  };
}

export function bookingAnalyticsStateFromSummary(summary: BookingPaymentSummary): BookingAnalyticsState {
  const extras = summary.extras
    .map((x) => (typeof x.slug === "string" ? x.slug : x.name))
    .filter((x): x is string => Boolean(x && String(x).trim()));
  return {
    service: summary.service,
    service_type: summary.service,
    finalPrice: summary.priceZar,
    finalHours: summary.hours,
    extras,
  };
}

type UseUnifiedPaymentFlowOptions = {
  summary: BookingPaymentSummary;
  paymentMode: UnifiedPaymentMode;
  attributionSource: string | null;
  /** Override derived state for analytics (e.g. cleaner id from funnel store). */
  analyticsState?: BookingAnalyticsState | null;
};

export function useUnifiedPaymentFlow({
  summary,
  paymentMode,
  attributionSource,
  analyticsState,
}: UseUnifiedPaymentFlowOptions) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stateForEvents = analyticsState ?? bookingAnalyticsStateFromSummary(summary);

  const verifyAndFinish = useCallback(
    async (reference: string) => {
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
      const st = json.state;
      if (st === "payment_mismatch" || st === "payment_reconciliation_required") {
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
      router.push(`/account/success?reference=${encodeURIComponent(ref)}`);
    },
    [router],
  );

  const handlePay = useCallback(() => {
    setError(null);
    setMessage(null);
    const email = summary.email?.trim().toLowerCase() ?? "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("This booking has no valid customer email. Update the booking email or contact support.");
      return;
    }
    if (summary.priceZar <= 0) {
      setError("Invalid checkout amount.");
      return;
    }

    void (async () => {
      setBusy(true);
      try {
        const preRes = await fetch("/api/bookings/payment-precheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: summary.id,
            expectedTotalZar: summary.priceZar,
          }),
        });
        const preJson = (await preRes.json()) as { ok?: boolean; error?: string };
        if (!preRes.ok || preJson.ok !== true) {
          const msg =
            typeof preJson.error === "string" && preJson.error.trim()
              ? preJson.error.trim()
              : "This checkout is no longer available. Refresh the page or start again.";
          setError(msg);
          setBusy(false);
          return;
        }

        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED, stateForEvents, {
          payment_provider: "paystack",
          payment_mode: paymentMode,
          paystack_flow: "ensure_session_redirect",
          booking_id: summary.id,
        });
        trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_INITIATED, {
          step: "booking_payment",
          booking_id: summary.id,
          payment_mode: paymentMode,
          total_zar: summary.priceZar,
        });

        // Prefer server-side session recovery (persisted authorization_url) over client-only
        // Inline refs — survives refresh, mobile tab kill, and abandoned checkout.
        const { getSession } = await import("@/lib/auth/authClient");
        const session = await getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const sessRes = await fetch(`/api/bookings/${encodeURIComponent(summary.id)}/payment-session`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...getGa4CheckoutIdentityFields(),
          }),
        });
        const sessJson = (await sessRes.json()) as {
          status?: string;
          authorizationUrl?: string;
          reference?: string;
          error?: string;
          message?: string;
        };

        if (sessJson.status === "paid") {
          const ref = (sessJson.reference ?? "").trim();
          router.push(ref ? `/account/success?reference=${encodeURIComponent(ref)}` : "/account/bookings");
          return;
        }

        if (sessJson.status === "ready" && typeof sessJson.authorizationUrl === "string" && sessJson.authorizationUrl.trim()) {
          if (sessJson.message) setMessage(sessJson.message);
          window.location.assign(sessJson.authorizationUrl.trim());
          return;
        }

        // Fallback: legacy Inline checkout when session recovery cannot run (e.g. guest without ref).
        const tip = 0;
        const amount = Math.max(100, Math.round(summary.priceZar * 100));
        const paystackRef = `pay_${crypto.randomUUID()}`;
        const metadata = buildInlinePaystackMetadata(summary, email, tip, {
          paymentMode,
          attributionSource,
        });
        if (typeof metadata.price_snapshot !== "string" || !metadata.price_snapshot.trim()) {
          setError("Invalid checkout preview. Refresh and try again.");
          setBusy(false);
          return;
        }
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
              await verifyAndFinish(ref);
            } finally {
              setBusy(false);
            }
          },
          onCancel: () => {
            setBusy(false);
            setMessage("Payment cancelled.");
          },
        });
        // Keep busy=true until Inline callbacks fire.
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start checkout.");
        setBusy(false);
      }
    })();
  }, [summary, paymentMode, attributionSource, stateForEvents, verifyAndFinish, router]);

  const payDisabled = summary.priceZar <= 0 || !summary.email?.trim();

  return {
    busy,
    error,
    message,
    handlePay,
    payDisabled,
  };
}
