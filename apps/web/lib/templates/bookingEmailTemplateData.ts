import type { BookingEmailPayload } from "@/lib/email/bookingEmailPayload";
import type { LifecycleEmailBookingContext } from "@/lib/email/lifecycleEmails";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getGoogleReviewWriteUrl } from "@/lib/seo/googleReviews";

export function customerNameFromEmail(email: string, name?: string | null): string {
  if (name?.trim()) return name.trim().slice(0, 120);
  const local = email.includes("@") ? email.split("@")[0]?.replace(/[.+_]/g, " ").trim() ?? "" : email.trim();
  return (local || "there").slice(0, 120);
}

function reviewUrlForBooking(bookingId: string): string {
  const appUrl = getPublicAppUrlBase().replace(/\/$/, "");
  return `${appUrl}/review?booking=${encodeURIComponent(bookingId)}`;
}

function accountUrl(): string {
  return `${getPublicAppUrlBase().replace(/\/$/, "")}/dashboard/bookings`;
}

function bookAgainUrl(): string {
  return `${getPublicAppUrlBase().replace(/\/$/, "")}/book`;
}

/** Shared booking fields for most customer lifecycle email templates. */
export function buildBookingPayloadTemplateData(payload: BookingEmailPayload): Record<string, string> {
  const bookingId = (payload.bookingId?.trim() || payload.paymentReference).trim();
  return {
    customer_name: customerNameFromEmail(payload.customerEmail, payload.customerName),
    service: payload.serviceLabel.trim(),
    service_name: payload.serviceLabel.trim(),
    date: payload.dateLabel.trim() || "—",
    booking_date: payload.dateLabel.trim() || "—",
    time: payload.timeLabel.trim() || "—",
    booking_time: payload.timeLabel.trim() || "—",
    location: payload.location?.trim() || "—",
    booking_address: payload.location?.trim() || "—",
    booking_id: bookingId,
    booking_reference: bookingId,
    payment_reference: payload.paymentReference.trim(),
    cleaner_name: payload.cleanerName?.trim() || "",
    account_url: accountUrl(),
    book_again_url: bookAgainUrl(),
    review_url: reviewUrlForBooking(bookingId),
    price: `R ${payload.totalPaidZar.toLocaleString("en-ZA")}`,
    total_price: `R ${payload.totalPaidZar.toLocaleString("en-ZA")}`,
  };
}

export function buildBookingAssignedTemplateData(payload: BookingEmailPayload): Record<string, string> {
  return buildBookingPayloadTemplateData(payload);
}

export function buildJobCompletedTemplateData(payload: BookingEmailPayload): Record<string, string> {
  const data = buildBookingPayloadTemplateData(payload);
  const googleReviewUrl = getGoogleReviewWriteUrl();
  return {
    ...data,
    google_review_url: googleReviewUrl ?? "",
    google_review_section: googleReviewUrl
      ? `<p style="margin-top:16px;">Hi! Thanks for booking with Shalean 🙌</p><p>If you have a moment, please leave us a quick Google review:</p><p><a href="${googleReviewUrl}" style="display:inline-block;margin-top:8px;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Leave a Google review</a></p>`
      : "",
  };
}

export function buildBookingCancelledTemplateData(params: {
  customerEmail: string;
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  bookingId: string;
}): Record<string, string> {
  return {
    customer_name: customerNameFromEmail(params.customerEmail, params.customerName),
    service: params.serviceLabel.trim(),
    service_name: params.serviceLabel.trim(),
    date: params.dateLabel.trim() || "—",
    booking_date: params.dateLabel.trim() || "—",
    time: params.timeLabel.trim() || "—",
    booking_time: params.timeLabel.trim() || "—",
    booking_id: params.bookingId.trim(),
    booking_reference: params.bookingId.trim(),
    book_again_url: bookAgainUrl(),
  };
}

export function buildBookingRescheduledTemplateData(params: {
  bookingId: string;
  serviceLabel: string;
  previousDate: string;
  previousTime: string;
  newDate: string;
  newTime: string;
}): Record<string, string> {
  return {
    service: params.serviceLabel.trim(),
    service_name: params.serviceLabel.trim(),
    previous_date: params.previousDate.trim(),
    previous_time: params.previousTime.trim(),
    new_date: params.newDate.trim(),
    new_time: params.newTime.trim(),
    booking_id: params.bookingId.trim(),
    booking_reference: params.bookingId.trim(),
    account_url: accountUrl(),
  };
}

export function buildReminder2hTemplateData(params: {
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  bookingId: string;
}): Record<string, string> {
  return {
    service: params.serviceLabel.trim(),
    service_name: params.serviceLabel.trim(),
    date: params.dateLabel.trim() || "—",
    time: params.timeLabel.trim() || "—",
    location: params.location.trim() || "—",
    booking_id: params.bookingId.trim(),
    booking_reference: params.bookingId.trim(),
    account_url: accountUrl(),
  };
}

export function buildPaymentProcessingTemplateData(input: {
  customerEmail: string;
  paymentReference: string;
}): Record<string, string> {
  return {
    customer_name: customerNameFromEmail(input.customerEmail),
    payment_reference: input.paymentReference.trim(),
  };
}

export function buildPaymentLinkTemplateData(input: {
  customerEmail: string;
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  amountZar: number | null;
  paymentUrl: string;
  bookingId: string;
  paystackReference: string;
}): Record<string, string> {
  const price =
    input.amountZar != null && Number.isFinite(input.amountZar)
      ? `R ${input.amountZar.toLocaleString("en-ZA")}`
      : "";
  return {
    customer_name: customerNameFromEmail(input.customerEmail, input.customerName),
    service: input.serviceLabel.trim(),
    date: input.dateLabel.trim() || "—",
    time: input.timeLabel.trim() || "—",
    price,
    payment_url: input.paymentUrl.trim(),
    booking_id: input.bookingId.trim(),
    booking_reference: input.bookingId.trim(),
    payment_reference: input.paystackReference.trim(),
  };
}

export function buildSavedQuoteRecoveryTemplateData(params: {
  customerEmail: string;
  firstName?: string | null;
  continueUrl: string;
  serviceLabel: string;
  quoteLabel?: string | null;
}): Record<string, string> {
  return {
    customer_name: customerNameFromEmail(params.customerEmail, params.firstName),
    service: params.serviceLabel.trim(),
    continue_url: params.continueUrl.trim(),
    quote_label: params.quoteLabel?.trim() ?? "",
  };
}

export function buildLifecycleTemplateData(ctx: LifecycleEmailBookingContext): Record<string, string> {
  return {
    service: ctx.serviceLabel.trim(),
    service_name: ctx.serviceLabel.trim(),
    date: ctx.dateLabel.trim() || "—",
    booking_date: ctx.dateLabel.trim() || "—",
    time: ctx.timeLabel.trim() || "—",
    booking_time: ctx.timeLabel.trim() || "—",
    location: ctx.location.trim() || "—",
    booking_id: ctx.bookingId.trim(),
    booking_reference: ctx.bookingId.trim(),
    account_url: accountUrl(),
    book_again_url: bookAgainUrl(),
    review_url: reviewUrlForBooking(ctx.bookingId),
  };
}

export function buildAdminPaymentConfirmedTemplateData(params: {
  bookingId: string;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  customerEmail: string;
  paymentReference: string;
}): Record<string, string> {
  return {
    booking_id: params.bookingId.trim(),
    payment_method: "Paystack",
    customer_email: params.customerEmail.trim(),
    service: params.serviceLabel.trim(),
    date: params.dateLabel.trim() || "—",
    time: params.timeLabel.trim() || "—",
    payment_reference: params.paymentReference.trim(),
  };
}
