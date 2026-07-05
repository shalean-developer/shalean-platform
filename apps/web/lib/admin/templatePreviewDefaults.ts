import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { customerAccountBookingsUrl } from "@/lib/customer/customerAccountPaths";

const SAMPLE_BOOKING_ID = "00000000-0000-4000-8000-000000000001";

/** Rich sample data for admin test sends and editor previews. */
export function buildDefaultTemplatePreviewData(): Record<string, unknown> {
  const appUrl = getPublicAppUrlBase().replace(/\/$/, "");
  return {
    customer_name: "Test Customer",
    booking_reference: SAMPLE_BOOKING_ID,
    booking_id: SAMPLE_BOOKING_ID,
    service_name: "Regular Cleaning",
    service: "Regular Cleaning",
    booking_date: "Mon, 1 Dec 2025",
    booking_time: "09:00",
    date: "Mon, 1 Dec 2025",
    time: "09:00",
    booking_address: "12 Example Street, Cape Town",
    location: "12 Example Street, Cape Town",
    total_price: "R 299",
    price: "R 299",
    payment_status: "Paid",
    payment_reference: "PSK-TEST-REF-001",
    cleaner_name: "Sarah M.",
    book_again_url: `${appUrl}/book`,
    account_url: customerAccountBookingsUrl(appUrl),
    payment_url: `${appUrl}/pay/${SAMPLE_BOOKING_ID}`,
    review_url: `${appUrl}/review?booking=${SAMPLE_BOOKING_ID}`,
    cleaner_substitution_notice: "",
    book_again_section: `<p style="margin-top:20px;font-size:14px;color:#374151;">Want the same cleaner next time?<br/><a href="${appUrl}/book" style="color:#2563eb;font-weight:500;text-decoration:none;">Book again in 10 seconds →</a></p>`,
  };
}

export function buildDefaultTemplatePreviewJson(): string {
  return JSON.stringify(buildDefaultTemplatePreviewData(), null, 2);
}
