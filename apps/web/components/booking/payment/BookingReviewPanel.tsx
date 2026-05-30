"use client";

import { PaymentCheckoutReview } from "@/components/booking/checkout/PaymentCheckoutReview";
import {
  getBookingSummaryServiceLabel,
  inferServiceTypeFromServiceId,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import { formatCheckoutDateOnly, formatCheckoutTimeDisplay } from "@/components/booking/summary/formatCheckoutWhenLabel";
import { bookingCopy } from "@/lib/booking/copy";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";

const payCopy = bookingCopy.checkoutPayment;

type Props = {
  summary: BookingPaymentSummary;
  className?: string;
};

export function BookingReviewPanel({ summary, className }: Props) {
  const sid = parseBookingServiceId(summary.service ?? "");
  const whatLabel = getBookingSummaryServiceLabel(sid, inferServiceTypeFromServiceId(sid));

  const datePart = formatCheckoutDateOnly(summary.dateYmd);
  const timePart = formatCheckoutTimeDisplay(summary.timeHm);
  const scheduleLine =
    datePart === "Not set yet" && timePart === "Not set yet" ? "—" : `${datePart} · ${timePart}`;

  const whereLabel = summary.locationDisplay?.trim() || payCopy.locationFallback;

  const cleanerLabel = summary.cleanerName?.trim()
    ? `${payCopy.cleanerSelectedShort}: ${summary.cleanerName.trim()}`
    : payCopy.cleanerBestAvailable;

  const extrasRows = summary.extras;
  const extrasLine =
    extrasRows.length === 0
      ? payCopy.extrasNone
      : extrasRows.length <= 3
        ? extrasRows.map((r) => (typeof r.name === "string" ? r.name : r.slug ?? "")).filter(Boolean).join(", ")
        : payCopy.extrasSelected(extrasRows.length);

  const summaryHours = summary.hours ?? 0;

  return (
    <PaymentCheckoutReview
      className={className}
      whatLabel={whatLabel}
      summaryHours={Number.isFinite(summaryHours) ? summaryHours : 0}
      scheduleLine={scheduleLine}
      whereLabel={whereLabel}
      cleanerLabel={cleanerLabel}
      extrasLine={extrasLine}
      summaryTotalZar={summary.priceZar}
      loading={false}
    />
  );
}
