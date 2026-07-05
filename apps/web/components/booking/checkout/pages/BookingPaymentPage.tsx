"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ExistingBookingPaymentPanel } from "@/components/booking/payment/ExistingBookingPaymentPanel";
import { PaymentBlockedMessage } from "@/components/booking/payment/PaymentBlockedMessage";
import {
  ANALYTICS_EVENTS,
  trackBookingAnalyticsEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import type { BookingPaymentPagePayload } from "@/lib/booking/bookingPaymentTypes";
import { checkoutSegmentPath } from "@/lib/booking/bookingCheckoutGuards";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { withBookingQuery } from "@/lib/booking/bookingUrl";
import {
  bookingAnalyticsStateFromSummary,
  unifiedPaymentModeFromSearchParams,
} from "@/lib/booking/useUnifiedPaymentFlow";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";

function funnelHandoffAnalyticsStateFromStore() {
  const s = useBookingCheckoutStore.getState();
  const sid = parseBookingServiceId(s.service);
  return {
    service: s.service,
    service_type: sid,
    extras: s.extras,
    serviceAreaName: s.serviceAreaName,
  };
}

type Props = {
  serverPayload: BookingPaymentPagePayload;
};

export function BookingPaymentPage({ serverPayload }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const paymentStartedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (serverPayload.status !== "ready") return;
    const unifiedMode = unifiedPaymentModeFromSearchParams(searchParams);
    const key = `ready:${serverPayload.summary.id}:${unifiedMode}`;
    if (paymentStartedKeyRef.current === key) return;
    paymentStartedKeyRef.current = key;

    trackBookingAnalyticsEvent(
      ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED,
      bookingAnalyticsStateFromSummary(serverPayload.summary),
      {
        payment_mode: unifiedMode,
        payment_provider: "paystack",
        booking_id: serverPayload.summary.id,
      },
    );
  }, [serverPayload, searchParams]);

  if (serverPayload.status === "blocked") {
    return <PaymentBlockedMessage reason={serverPayload.reason} />;
  }

  const unifiedMode = unifiedPaymentModeFromSearchParams(searchParams);
  const attributionSource = searchParams.get("source");
  const analyticsState = unifiedMode === "funnel" ? funnelHandoffAnalyticsStateFromStore() : null;
  const onBack =
    unifiedMode === "funnel"
      ? () => router.push(withBookingQuery(checkoutSegmentPath("cleaner"), searchParams))
      : () => router.push("/account/bookings");

  return (
    <ExistingBookingPaymentPanel
      summary={serverPayload.summary}
      paymentMode={unifiedMode}
      attributionSource={attributionSource}
      analyticsState={analyticsState}
      onBack={onBack}
    />
  );
}
