import type { BookingEmailPayload } from "@/lib/email/bookingEmailPayload";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { customerAccountBookingUrl } from "@/lib/customer/customerAccountPaths";
import {
  displayCustomerBookingReference,
  displayCustomerPaymentReference,
} from "@/lib/booking/customerBookingReference";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Template variables for booking_confirmed across email / SMS channels. */
export function buildBookingConfirmedTemplateData(payload: BookingEmailPayload): Record<string, string> {
  const appUrl = getPublicAppUrlBase().replace(/\/$/, "");
  const price = `R ${payload.totalPaidZar.toLocaleString("en-ZA")}`;
  const bookingRef =
    displayCustomerBookingReference({ bookingReference: payload.bookingReference }) ?? "Pending";
  const paymentRef = displayCustomerPaymentReference(payload.paymentReference);
  const emailLocal = payload.customerEmail.includes("@")
    ? payload.customerEmail.split("@")[0]?.replace(/[.+_]/g, " ").trim() ?? ""
    : payload.customerEmail.trim();
  const customerName = (payload.customerName?.trim() || emailLocal || "there").slice(0, 120);
  const serviceName = payload.serviceLabel.trim() || "Cleaning service";
  const bookingDate = payload.dateLabel.trim() || "Pending";
  const bookingTime = payload.timeLabel.trim() || "Pending";
  const address = payload.location?.trim() ?? "";
  const suburb = payload.suburb?.trim() ?? "";
  const extras = payload.extrasLabel?.trim() ?? "";
  const recurring = payload.recurringSummary?.trim() ?? "";
  const cleanerName = payload.cleanerName?.trim() ?? "";
  const cleanerStatus =
    payload.cleanerStatusLabel?.trim() || cleanerName || "Cleaner assignment pending";
  const bookAgainUrl = `${appUrl}/book`;
  const accountUrl = customerAccountBookingUrl(appUrl, payload.bookingId);

  const cleanerSubstitutionNotice = payload.showCleanerSubstitutionNotice
    ? `<div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:14px 16px;margin-bottom:18px;color:#78350f;font-size:14px;line-height:1.45;"><strong>Cleaner update:</strong> Your selected cleaner isn&apos;t available at that time — we&apos;ve assigned a similar top-rated cleaner.</div>`
    : "";

  const bookAgainSection = bookAgainUrl
    ? `<p style="margin-top:20px;font-size:14px;color:#374151;">Want the same cleaner next time?<br/><a href="${escapeAttr(bookAgainUrl)}" style="color:#2563eb;font-weight:500;text-decoration:none;">Book again in 10 seconds →</a></p>`
    : "";

  const extrasRow = extras
    ? `<p style="margin:0 0 8px;"><strong>Extras:</strong> ${escapeHtml(extras)}</p>`
    : "";
  const suburbRow = suburb
    ? `<p style="margin:0 0 8px;"><strong>Suburb:</strong> ${escapeHtml(suburb)}</p>`
    : "";
  const recurringRow = recurring
    ? `<p style="margin:0 0 8px;"><strong>Recurring:</strong> ${escapeHtml(recurring)}</p>`
    : "";

  return {
    customer_name: customerName,
    booking_reference: bookingRef,
    booking_id: bookingRef,
    service_name: serviceName,
    service: serviceName,
    booking_date: bookingDate,
    booking_time: bookingTime,
    date: bookingDate,
    time: bookingTime,
    booking_address: address,
    location: address,
    suburb,
    extras: extras,
    extras_label: extras,
    extras_row: extrasRow,
    suburb_row: suburbRow,
    recurring_summary: recurring,
    recurring_row: recurringRow,
    total_price: price,
    price,
    payment_status: "Paid",
    payment_reference: paymentRef,
    cleaner_name: cleanerStatus,
    cleaner_status: cleanerStatus,
    book_again_url: bookAgainUrl,
    account_url: accountUrl,
    cleaner_substitution_notice: cleanerSubstitutionNotice,
    book_again_section: bookAgainSection,
  };
}
