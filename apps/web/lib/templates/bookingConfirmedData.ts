import type { BookingEmailPayload } from "@/lib/email/bookingEmailPayload";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { customerAccountBookingsUrl } from "@/lib/customer/customerAccountPaths";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Template variables for booking_confirmed across email / SMS channels. */
export function buildBookingConfirmedTemplateData(payload: BookingEmailPayload): Record<string, string> {
  const appUrl = getPublicAppUrlBase().replace(/\/$/, "");
  const price = `R ${payload.totalPaidZar.toLocaleString("en-ZA")}`;
  const bookingId = (payload.bookingId?.trim() || payload.paymentReference).trim();
  const paymentRef = payload.paymentReference.trim();
  const emailLocal = payload.customerEmail.includes("@")
    ? payload.customerEmail.split("@")[0]?.replace(/[.+_]/g, " ").trim() ?? ""
    : payload.customerEmail.trim();
  const customerName = (payload.customerName?.trim() || emailLocal || "there").slice(0, 120);
  const serviceName = payload.serviceLabel.trim();
  const bookingDate = payload.dateLabel.trim();
  const bookingTime = payload.timeLabel.trim();
  const address = payload.location?.trim() ?? "";
  const cleanerName = payload.cleanerName?.trim() ?? "";
  const bookAgainUrl = `${appUrl}/book`;
  const accountUrl = customerAccountBookingsUrl(appUrl);

  const cleanerSubstitutionNotice = payload.showCleanerSubstitutionNotice
    ? `<div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:14px 16px;margin-bottom:18px;color:#78350f;font-size:14px;line-height:1.45;"><strong>Cleaner update:</strong> Your selected cleaner isn&apos;t available at that time — we&apos;ve assigned a similar top-rated cleaner.</div>`
    : "";

  const bookAgainSection = bookAgainUrl
    ? `<p style="margin-top:20px;font-size:14px;color:#374151;">Want the same cleaner next time?<br/><a href="${escapeAttr(bookAgainUrl)}" style="color:#2563eb;font-weight:500;text-decoration:none;">Book again in 10 seconds →</a></p>`
    : "";

  return {
    customer_name: customerName,
    booking_reference: bookingId,
    booking_id: bookingId,
    service_name: serviceName,
    service: serviceName,
    booking_date: bookingDate,
    booking_time: bookingTime,
    date: bookingDate,
    time: bookingTime,
    booking_address: address,
    location: address,
    total_price: price,
    price,
    payment_status: "Paid",
    payment_reference: paymentRef,
    cleaner_name: cleanerName,
    book_again_url: bookAgainUrl,
    account_url: accountUrl,
    cleaner_substitution_notice: cleanerSubstitutionNotice,
    book_again_section: bookAgainSection,
  };
}
